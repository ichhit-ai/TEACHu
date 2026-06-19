import io
import urllib.request
import urllib.parse
import json
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pypdf import PdfReader
from duckduckgo_search import DDGS
import edge_tts
from typing import List, Optional
import re

# Import our Gemini services
from app.gemini_service import generate_explanation, generate_quiz_question, evaluate_answer

app = FastAPI(title="TEACHu Backend")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory state for local single-user deployment
current_pdf_context = ""
past_quiz_questions = []

class ExplainRequest(BaseModel):
    topic: str
    use_pdf: bool = False
    language: str = "hinglish"

class QuizGenerateRequest(BaseModel):
    topic: str
    use_pdf: bool = False
    language: str = "hinglish"

class QuizEvaluateRequest(BaseModel):
    question: str
    expected_keywords: List[str]
    user_answer: str
    language: str = "hinglish"

def is_image_relevant(title: str, query: str) -> bool:
    title_lower = title.lower()
    allowed_extensions = ('.svg', '.png', '.jpg', '.jpeg', '.gif')
    if not title_lower.endswith(allowed_extensions):
        return False
    
    stop_words = {
        'file', 'diagram', 'flowchart', 'illustration', 'chart', 'photo', 'image', 
        'picture', 'visual', 'schematic', 'simple', 'basic', 'study', 'notes',
        'concept', 'method', 'approach', 'system', 'process', 'example', 'illustration',
        'the', 'and', 'for', 'with', 'that', 'this', 'are', 'can', 'how', 'what', 'why',
        'your', 'from', 'into', 'over', 'under', 'between', 'out'
    }
    
    query_words = {w.lower() for w in re.findall(r'\b\w{2,}\b', query) if w.lower() not in stop_words}
    if not query_words:
        return False
        
    clean_title = title_lower.replace("file:", "")
    for ext in allowed_extensions:
        if clean_title.endswith(ext):
            clean_title = clean_title[:-len(ext)]
            break
            
    title_words = {w for w in re.findall(r'\b\w{2,}\b', clean_title) if w not in stop_words}
    
    abbreviations = {
        'rag': {'retrieval', 'augmented', 'generation'},
        'llm': {'large', 'language', 'model'},
        'rnn': {'recurrent', 'neural', 'network'},
        'cnn': {'convolutional', 'neural', 'network'},
        'gans': {'generative', 'adversarial', 'network'},
        'nlp': {'natural', 'language', 'processing'},
        'api': {'application', 'programming', 'interface'},
        'oop': {'object', 'oriented', 'programming'},
    }
    
    expanded_query_words = set(query_words)
    for qw in query_words:
        if qw in abbreviations:
            expanded_query_words.update(abbreviations[qw])
            
    expanded_title_words = set(title_words)
    for tw in title_words:
        if tw in abbreviations:
            expanded_title_words.update(abbreviations[tw])
            
    overlap = expanded_query_words.intersection(expanded_title_words)
    
    if not overlap:
        return False
        
    tech_acronyms = {'rag', 'llm', 'rnn', 'cnn', 'gans', 'nlp', 'api', 'oop'}
    query_acronyms = query_words.intersection(tech_acronyms)
    if query_acronyms:
        required_words = set(query_acronyms)
        for qa in query_acronyms:
            required_words.update(abbreviations[qa])
        if not expanded_title_words.intersection(required_words):
            return False
            
    if len(query_words) >= 2:
        if len(overlap) == 1:
            matched_word = list(overlap)[0]
            generic_tech = {'programming', 'user', 'scaling', 'data', 'web', 'file', 'code', 'online'}
            if matched_word in generic_tech:
                return False
                
    return True

def search_wikimedia_images(query: str, original_query: str = None) -> List[str]:
    """
    Query Wikimedia Commons API for open academic illustrations.
    This acts as a high-reliability fallback that is never rate-limited.
    """
    try:
        encoded_query = urllib.parse.quote(query)
        url = f"https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch={encoded_query}&gsrlimit=5&prop=imageinfo&iiprop=url"
        
        req = urllib.request.Request(url, headers={'User-Agent': 'TEACHu-Academic-Tutor/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            pages = data.get("query", {}).get("pages", {})
            urls = []
            for page_id, page_info in pages.items():
                title = page_info.get("title", "")
                
                # Check relevance
                match_query = original_query if original_query else query
                if not is_image_relevant(title, match_query):
                    print(f"Filtering irrelevant Wikimedia image: {title}")
                    continue
                    
                imageinfo = page_info.get("imageinfo", [])
                if imageinfo:
                    img_url = imageinfo[0].get("url")
                    if img_url:
                        urls.append(img_url)
            return urls
    except Exception as e:
        print(f"Wikimedia search failed for '{query}': {e}")
        return []

def search_images(query: str, fallback_query: str = None) -> List[str]:
    """
    Search DuckDuckGo with fallback to Wikimedia Commons to avoid rate-limiting blocks.
    """
    # 1. Try DuckDuckGo with full descriptive query
    try:
        with DDGS() as ddgs:
            results = list(ddgs.images(query, max_results=5))
            urls = []
            for r in results:
                title = r.get("title", "")
                image_url = r.get("image", "")
                filename = image_url.split("/")[-1].split("?")[0]
                check_text = f"{title} {filename}"
                if is_image_relevant(check_text, fallback_query if fallback_query else query):
                    urls.append(image_url)
                    if len(urls) >= 3:
                        break
                else:
                    print(f"Filtering irrelevant DuckDuckGo image: {title}")
            if urls:
                return urls
    except Exception as e:
        print(f"DuckDuckGo image search failed for '{query}': {e}")

    # 2. Try DuckDuckGo again with a simplified query
    if fallback_query:
        simplified = f"{fallback_query} diagram"
        try:
            with DDGS() as ddgs:
                results = list(ddgs.images(simplified, max_results=5))
                urls = []
                for r in results:
                    title = r.get("title", "")
                    image_url = r.get("image", "")
                    filename = image_url.split("/")[-1].split("?")[0]
                    check_text = f"{title} {filename}"
                    if is_image_relevant(check_text, fallback_query):
                        urls.append(image_url)
                        if len(urls) >= 3:
                            break
                    else:
                        print(f"Filtering irrelevant DuckDuckGo image: {title}")
                if urls:
                    return urls
        except Exception:
            pass

    # 3. Fallback to Wikimedia Commons (reliable, high-quality, free)
    search_term = fallback_query if fallback_query else query
    print(f"Attempting Wikimedia Commons fallback for: {search_term}")
    urls = search_wikimedia_images(search_term, search_term)
    if not urls:
        urls = search_wikimedia_images(f"{search_term} diagram", search_term)
    
    return urls

@app.post("/api/explain")
async def explain(req: ExplainRequest):
    if not req.topic:
        raise HTTPException(status_code=400, detail="Topic is required")
    
    # Check if we should use the PDF context
    context = current_pdf_context if req.use_pdf else None
    
    # Generate structured explanation from Gemini in the target language
    explanation_data = generate_explanation(req.topic, context, req.language)
    
    # Resolve image queries to real URLs
    blocks = explanation_data.get("blocks", [])
    for block in blocks:
        if block.get("type") == "image":
            query = block.get("query")
            fallback_query = block.get("fallback_query", req.topic)
            if query:
                urls = search_images(query, fallback_query)
                block["urls"] = urls
            else:
                block["urls"] = []
                
    return explanation_data

@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    global current_pdf_context
    try:
        contents = await file.read()
        pdf_reader = PdfReader(io.BytesIO(contents))
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        current_pdf_context = text.strip()
        if not current_pdf_context:
            raise HTTPException(status_code=400, detail="No readable text found in PDF.")
            
        # Generate a quick title for the PDF using Gemini
        pdf_title = "Uploaded PDF Notes"
        try:
            from app.gemini_service import get_model
            model = get_model()
            sample_text = current_pdf_context[:2000]
            resp = model.generate_content(
                f"Identify the main subject or topic of this text. Return ONLY a short 2 to 4 word title in English representing the topic. Do not include quotes, preamble, or formatting.\n\nText:\n{sample_text}"
            )
            val = resp.text.strip().replace('"', '').replace("'", "")
            if val and len(val) < 50:
                pdf_title = val
        except Exception as e:
            print(f"Failed to auto-generate PDF title: {e}")
            
        return {
            "status": "success", 
            "char_count": len(current_pdf_context), 
            "pdf_title": pdf_title,
            "message": "PDF uploaded and parsed successfully!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear-pdf")
async def clear_pdf():
    global current_pdf_context
    current_pdf_context = ""
    return {"status": "success", "message": "PDF context cleared."}

@app.get("/api/tts")
async def tts(text: str = Query(..., description="Text to speak"), language: str = "hinglish"):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text parameter is empty")
    
    # Select voice based on language parameter
    lang_lower = language.lower()
    if lang_lower == "hindi":
        voice = "hi-IN-SwaraNeural" # Natural Devanagari Hindi (Female)
    elif lang_lower == "english":
        voice = "en-IN-NeerjaNeural" # Clear Indian English (Female)
    else:
        # Hinglish defaults to hi-IN voice (which handles English spelling and Indian phonetic flow very well)
        voice = "hi-IN-MadhurNeural"
        
    try:
        communicate = edge_tts.Communicate(text, voice)
        
        async def audio_generator():
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
                    
        return StreamingResponse(audio_generator(), media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/quiz/generate")
async def generate_quiz(req: QuizGenerateRequest):
    global past_quiz_questions
    context = current_pdf_context if req.use_pdf else None
    
    quiz_data = generate_quiz_question(req.topic, context, past_quiz_questions, req.language)
    
    # Track asked questions to prevent repetitions
    question_text = quiz_data.get("question")
    if question_text:
        past_quiz_questions.append(question_text)
        if len(past_quiz_questions) > 10:
            past_quiz_questions.pop(0)
            
    return quiz_data

@app.post("/api/quiz/evaluate")
async def evaluate_quiz(req: QuizEvaluateRequest):
    if not req.question or not req.user_answer:
        raise HTTPException(status_code=400, detail="Question and student answer are required")
        
    evaluation = evaluate_answer(req.question, req.expected_keywords, req.user_answer, req.language)
    return evaluation

# Mount static files (serves frontend files directly)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
