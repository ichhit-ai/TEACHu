import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure the Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
else:
    print("Warning: GEMINI_API_KEY environment variable is not set.")

def get_model(model_name="gemini-3.1-flash-lite"):
    """
    Returns a configured model instance.
    """
    return genai.GenerativeModel(model_name)

def generate_content_with_fallback(prompt: str, generation_config: dict = None) -> str:
    models_to_try = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-2.5-flash", "gemini-pro-latest"]
    last_err = None
    for model_name in models_to_try:
        try:
            model = get_model(model_name)
            resp = model.generate_content(prompt, generation_config=generation_config)
            return resp.text
        except Exception as e:
            last_err = e
            print(f"Fallback warning: failed using model {model_name}: {e}")
            continue
    raise last_err

def parse_json_response(text: str) -> dict:
    text_clean = text.strip()
    if text_clean.startswith("```"):
        lines = text_clean.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines[-1].startswith("```"):
            lines = lines[:-1]
        text_clean = "\n".join(lines).strip()
    
    try:
        return json.loads(text_clean)
    except json.JSONDecodeError:
        start_idx = text_clean.find('{')
        end_idx = text_clean.rfind('}')
        if start_idx != -1 and end_idx != -1:
            try:
                return json.loads(text_clean[start_idx:end_idx+1])
            except json.JSONDecodeError:
                pass
        raise

def generate_explanation(topic: str, context_text: str = None, language: str = "hinglish") -> dict:
    """
    Generates a structured explanation in the chosen language (English, Hinglish, or Hindi) 
    with interspersed image queries and a Mermaid diagram.
    """
    model = get_model()
    
    # Choose language instructions
    if language.lower() == "hindi":
        lang_instruction = "Devanagari Hindi (using Devanagari script: हिन्दी, e.g. 'तो दोस्तों, रिकर्शन का मतलब...'). Use simple, conversational words, not overly formal Sanskritized Hindi."
        fallback_msg = f"Sorry dosto, {topic} ke baare mein explain karne mein thodi dikkat aa rahi hai."
    elif language.lower() == "english":
        lang_instruction = "Simple, conversational, student-friendly academic English. Use engaging analogies, examples, and a friendly tone."
        fallback_msg = f"Sorry, there was a problem explaining {topic}. Please try again!"
    else:
        # Default Hinglish
        lang_instruction = "Conversational, localized Hinglish (Hindi written in Latin script, e.g., 'Toh dosto, recursion matlab...'). Use local analogies, clean jokes, and a friendly tone."
        fallback_msg = f"Sorry dosto, {topic} ke baare mein explain karne mein thodi dikkat aa rahi hai."

    prompt = f"""
    You are TEACHu, an expert, extremely engaging localized teaching assistant. 
    Explain the topic: "{topic}" to a college student. 
    You must generate the explanation text in: {lang_instruction}.
    Break it down so that the student can understand it instantly. Use everyday analogies, examples, or simple code/formulas where possible.
    
    You MUST structure your response as a JSON object matching this schema.
    The "blocks" array MUST contain alternating "text" and "image" blocks. 
    CRITICAL: You MUST include at least one "image" block, and as many "image" blocks as necessary to visually explain the topic clearly (even 7 to 8 for complex topics). Never return an explanation without any image blocks.
    
    Format your response as a JSON object matching this schema:
    {{
      "title": "Topic Name",
      "blocks": [
        {{
          "type": "text",
          "summary": "A very brief, clear 1-sentence bullet point in English summarizing this section for read-along support.",
          "explanation": "The detailed conversational explanation in the target language (about 3-4 sentences)."
        }},
        {{
          "type": "image",
          "query": "A simple, highly searchable diagram query (e.g., 'RAG pipeline flowchart diagram' or 'Vector search database illustration') to find high-quality educational visuals on search engines.",
          "fallback_query": "A broad, simple academic topic keyword in English (e.g., 'Retrieval-augmented generation' or 'Recursion' or 'Quantum Entanglement') to use as a fallback search on Wikipedia Commons."
        }}
        // Alternating text and image blocks...
      ],
      "mermaid_diagram": "A valid Mermaid.js flowchart (graph TD or graph LR) representing the topic. Ensure ALL text labels inside nodes are strictly wrapped in double quotes to prevent syntax errors (e.g. A(\"Node Label\") instead of A(Node Label)). Keep it simple and focused (5 to 10 nodes). Do not wrap the response in markdown code blocks. Start directly with the graph keyword."
    }}
    """
    
    if context_text:
        # Truncate context to keep prompt focused and prevent model parsing timeouts
        truncated_context = context_text[:12000]
        prompt += f"\n\nGround your explanation in the following reference text (truncated for size):\n{truncated_context}"
        
    try:
        response_text = generate_content_with_fallback(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return parse_json_response(response_text)
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        return {
            "title": topic,
            "blocks": [
                {
                  "type": "text",
                  "summary": f"Failed to generate explanation for {topic}.",
                  "explanation": fallback_msg
                }
            ],
            "mermaid_diagram": "graph TD\n  Error((Error)) --> Retry[Try Again]"
        }

def generate_quiz_question(topic: str, context_text: str = None, past_questions: list = None, language: str = "hinglish") -> dict:
    """
    Generates a conceptual active-recall question about a topic (or PDF text) in the target language.
    """
    model = get_model()
    
    if language.lower() == "hindi":
        lang_desc = "Devanagari Hindi (devanagari script)"
        fallback_q = f"क्या आप मुझे बता सकते हैं कि {topic} कैसे काम करता है?"
        fallback_h = "बेसिक पॉइंट्स समझाइए।"
    elif language.lower() == "english":
        lang_desc = "Conversational English"
        fallback_q = f"Can you explain the basic working of {topic} in your own words?"
        fallback_h = "Explain the core concepts briefly."
    else:
        lang_desc = "Conversational Hinglish (Hindi in Latin script)"
        fallback_q = f"Kya aap mujhe bata sakte hain ki {topic} basic levels par kaise kaam karta hai?"
        fallback_h = "Bas high-level points bataiye."

    prompt = f"""
    You are TEACHu. Generate an interactive active-recall quiz question about the topic: "{topic}".
    The question and the hint MUST be formulated in: {lang_desc}.
    Make it open-ended (not multiple choice) so the student has to explain the concept in their own words or solve a simple problem verbally.
    
    Format your response as a JSON object matching this schema:
    {{
      "question": "The quiz question in the target language.",
      "expected_keywords": ["list", "of", "3-5", "key", "academic", "terms", "expected", "in", "answer"],
      "hint": "A helpful hint in the target language if they get stuck."
    }}
    """
    
    if context_text:
        truncated_context = context_text[:12000]
        prompt += f"\n\nContext document content to build questions from (truncated):\n{truncated_context}"
    if past_questions:
        prompt += f"\n\nCRITICAL CONSTRAINT: You MUST generate a completely new question that tests a different aspect of this topic. DO NOT repeat, rephrase, or ask a question similar to any of these previously asked questions:\n{json.dumps(past_questions)}"
        
    try:
        response_text = generate_content_with_fallback(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return parse_json_response(response_text)
    except Exception as e:
        print(f"Error calling Gemini for quiz: {e}")
        return {
            "question": fallback_q,
            "expected_keywords": [topic.lower()],
            "hint": fallback_h
        }

def evaluate_answer(question: str, expected_keywords: list, user_answer: str, language: str = "hinglish") -> dict:
    """
    Evaluates the student's transcribed spoken answer and returns feedback in the target language.
    """
    model = get_model()
    
    if language.lower() == "hindi":
        lang_desc = "Devanagari Hindi (हिन्दी)"
        fallback_f = "बढ़िया प्रयास! आपका उत्तर रिकॉर्ड हो गया है।"
    elif language.lower() == "english":
        lang_desc = "Conversational English"
        fallback_f = "Good attempt! Your answer has been recorded."
    else:
        lang_desc = "Conversational Hinglish (Latin script)"
        fallback_f = "Badiya attempt! Aapka answer record ho chuka hai."

    prompt = f"""
    You are TEACHu. Evaluate a student's answer to a quiz question.
    
    Question: "{question}"
    Expected key terms: {json.dumps(expected_keywords)}
    Student's spoken answer: "{user_answer}"
    
    Analyze if the student understands the core concept. They do not need to use exact matching words, but their meaning should cover the concept and key terms.
    
    You MUST write the feedback in: {lang_desc}.
    
    Format your response as a JSON object matching this schema:
    {{
      "is_correct": true or false,
      "score_delta": score change (integer, e.g. 10 if correct, 0 if incorrect),
      "feedback": "Conversational feedback in the target language. If correct, praise them and summarize key points. If incorrect, politely explain what was missing and give the correct explanation."
    }}
    """
    try:
        response_text = generate_content_with_fallback(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return parse_json_response(response_text)
    except Exception as e:
        print(f"Error calling Gemini for evaluation: {e}")
        return {
            "is_correct": True,
            "score_delta": 10,
            "feedback": fallback_f
        }
