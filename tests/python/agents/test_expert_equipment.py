from __future__ import annotations

from pathlib import Path

from eido_agent.config import AgentConfig
from eido_agent.models import AgentProfile
from eido_agent.runtime import AgentRuntime


def test_expert_uses_only_equipped_tools_and_skills(tmp_path: Path) -> None:
    runtime = AgentRuntime(
        AgentConfig(data_dir=tmp_path / "data", skills_dir=Path("database/agents/skills"))
    )
    expert = AgentProfile(
        id="expert-1",
        name="Strict expert",
        owner_user_id="user-1",
        agent_type="expert",
        workspace_dir=str(tmp_path / "workspace-1"),
        enabled_tool_ids=["web_search", "exec_command"],
        enabled_skill_ids=["weather"],
    )
    runtime.create_agent(expert)

    assert set(runtime._build_tools(expert).tool_names) == {"web_search", "exec"}
    assert [skill["name"] for skill in runtime._skills_for(expert).list()] == ["weather"]


def test_expert_with_no_equipment_has_no_tools_or_skills(tmp_path: Path) -> None:
    runtime = AgentRuntime(
        AgentConfig(data_dir=tmp_path / "data", skills_dir=Path("database/agents/skills"))
    )
    expert = AgentProfile(
        id="expert-2",
        name="Unconfigured expert",
        owner_user_id="user-1",
        agent_type="expert",
        workspace_dir=str(tmp_path / "workspace-2"),
    )
    runtime.create_agent(expert)

    assert runtime._build_tools(expert).tool_names == []
    assert runtime._skills_for(expert).list() == []


def test_agents_can_share_a_workspace_without_sharing_equipped_skills(tmp_path: Path) -> None:
    runtime = AgentRuntime(
        AgentConfig(data_dir=tmp_path / "data", skills_dir=Path("database/agents/skills"))
    )
    shared_workspace = str(tmp_path / "workspace")
    weather_expert = AgentProfile(
        id="weather-expert", name="Weather", owner_user_id="user-1",
        workspace_dir=shared_workspace, enabled_skill_ids=["weather"],
    )
    empty_expert = AgentProfile(
        id="empty-expert", name="Empty", owner_user_id="user-1",
        workspace_dir=shared_workspace,
    )

    assert [skill["name"] for skill in runtime._skills_for(weather_expert).list()] == ["weather"]
    assert runtime._skills_for(empty_expert).list() == []
    assert [skill["name"] for skill in runtime._skills_for(weather_expert).list()] == ["weather"]

