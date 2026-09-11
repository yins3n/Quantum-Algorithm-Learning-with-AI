import os
import time
from google import genai
from google.genai import errors

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

def ask_gemini(prompt: str):
    system_prompt = """
You are the AI assistant for Egreen Quanta,
an educational platform for learning quantum algorithms.

Understand the user's quantum computing request and explain it simply.

Return ONLY valid JSON, with no markdown or extra text.
Use this structure:
{
  "algorithm": "algorithm name",
  "explanation": "simple explanation",
  "qiskit_code": "Qiskit code as a string",
  "gate_sequence": ["gate 1", "gate 2", "gate 3"]
}

Do not execute the generated code.
"""

    full_prompt = system_prompt + "\n\nUser request:\n" + prompt

    max_retries = 3
    retry_delay = 2  # seconds

    for attempt in range(max_retries + 1):
        try:
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=full_prompt,
                config={"response_mime_type": "application/json"},
            )
            return response.text
        except Exception as e:
            is_unavailable = False
            if isinstance(e, errors.APIError):
                if getattr(e, "code", None) == 503 or str(getattr(e, "status", "")).upper() == "UNAVAILABLE":
                    is_unavailable = True
            err_msg = str(e).upper()
            if "503" in err_msg or "UNAVAILABLE" in err_msg:
                is_unavailable = True

            if is_unavailable and attempt < max_retries:
                time.sleep(retry_delay * (attempt + 1))
                continue
            raise

