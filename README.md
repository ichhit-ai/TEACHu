# TEACHu

TEACHu is a localized, conversational academic study tutor designed to help college students understand complex topics through engaging analogies, visual diagrams, and active recall checkpoints. It supports explanations in **English, Hinglish (Hindi in Latin script), and Hindi**.

---

## Key Features

* **Conversational AI Explanations**: Uses Gemini 2.5 Flash to break down complex subjects using student-friendly analogies.
* **Auto-Filtered Academic Diagrams**: Searches and retrieves relevant diagrams and flowcharts from DuckDuckGo Images and Wikimedia Commons, using a strict matching filter to discard unrelated images.
* **Interactive Mermaid.js Charts**: Generates structural flowcharts dynamically inline to visualize concepts.
* **TTS Voice Reader with Speed Control**: Speaks explanations aloud using Edge-TTS. Features a floating controller in the bottom right corner to cycle speech rates (`1.0x`, `1.5x`, `2.0x`, `2.5x`, `3.0x`).
* **Active Recall Quiz**: Generates adaptive conceptual questions based on your study topics or uploaded files, evaluates answers, and provides constructive feedback.
* **Custom PDF Context**: Upload your class slides, textbooks, or notes. The platform automatically extracts the core subject title, pre-fills the input fields, and prompts you to start studying or quiz yourself on the PDF's content.
* **Theme Customization**: Fluid dark and light modes toggled via a floating action button.

---

## Tech Stack

* **Frontend**: HTML5, Vanilla CSS3 (curated theme, responsive grid), Vanilla JavaScript (audio visualizer, custom modals).
* **Backend**: FastAPI (Python), PyPDF (document parsing), Edge-TTS (speech generation), DuckDuckGo Search / Wikimedia API (diagram retrieval).
* **AI Engine**: Google Gemini 2.5 Flash.

---

## Local Setup

### Prerequisites
* Python 3.10+
* A Google Gemini API Key

### Step 1: Clone the repository
```bash
git clone https://github.com/ichhit-ai/TEACHu.git
cd TEACHu
```

### Step 2: Set up a virtual environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8055
```

### Step 4: Run the application
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8055 --reload
```
Open your browser and navigate to `http://127.0.0.1:8055` to start using TEACHu.

---

## Deployment on Render (Web Service)

This project is configured to run as a single unified service (FastAPI serves the frontend directly from `/`).

1. **Connect Repository**: Create a new Web Service on Render pointing to your fork/repository.
2. **Build Settings**:
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. **Environment Variables**: Add your `GEMINI_API_KEY` under the variables tab.
