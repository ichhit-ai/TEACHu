#!/bin/bash

# Exit on error
set -e

echo "=================================================="
echo "          TEACHu - Initializing Setup             "
echo "=================================================="

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "Installing python packages..."
pip install --upgrade pip
pip install -r requirements.txt

# Run the app
echo "=================================================="
echo "          TEACHu - Starting Servers               "
echo "=================================================="
echo "API Server is starting at: http://127.0.0.1:8055"
echo "Launch your browser and open: http://127.0.0.1:8055"
echo "=================================================="

uvicorn app.main:app --host 127.0.0.1 --port 8055 --reload
