from eido_agent.runtime import AgentRuntime


def test_project_context_is_generic() -> None:
    prompt = AgentRuntime._system_prompt_with_project_context(
        "base prompt",
        {
            "project_id": "document-reviewer",
            "project_name": "文档审阅",
            "kind": "document",
            "title": "proposal.pdf",
            "file_path": "/workspace/data/projects/document-reviewer/proposal.pdf",
            "content": "正文摘要",
        },
    )

    assert prompt.startswith("base prompt")
    assert "document-reviewer" in prompt
    assert "proposal.pdf" in prompt
    assert "正文摘要" in prompt


def test_missing_project_context_keeps_prompt_unchanged() -> None:
    assert AgentRuntime._system_prompt_with_project_context("base prompt", None) == "base prompt"
