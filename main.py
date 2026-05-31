from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

topic_tree = []


class SessionData(BaseModel):
    topic: str
    player_a_viewpoint: str
    player_b_viewpoint: str


@app.get("/")
def root():
    return {
        "message": "AI backend is running",
        "available_routes": [
            "GET /",
            "POST /summarize-session",
            "GET /topic-tree"
        ]
    }


@app.post("/summarize-session")
def summarize_session(data: SessionData):
    result = {
        "topic": data.topic,

        "player_a_summary":
        f"Player A believes: {data.player_a_viewpoint}",

        "player_b_summary":
        f"Player B believes: {data.player_b_viewpoint}",

        "combined_summary":
        "Both participants discussed the topic and expressed different viewpoints.",

        "follow_up_questions": [
            "What evidence supports each viewpoint?",
            "Can both viewpoints be true simultaneously?",
            "What assumptions are being made?"
        ]
    }

    topic_tree.append(result)

    return result


@app.get("/topic-tree")
def get_topic_tree():
    return {
        "total_sessions": len(topic_tree),
        "topics": topic_tree
    }