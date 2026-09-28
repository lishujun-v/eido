import re
import os


async def execute_work(node_id, context, services):
    """Work 节点统一入口，按 node_id 分发到对应处理逻辑。"""

    if node_id == "search_prior_art":
        topic = context["topic"]
        instruction = (
            "你是一位资深专利分析师。请针对以下专利主题，搜索并总结现有技术现状。\n"
            "请从以下方面进行分析：\n"
            "1. 该领域目前的主流技术方案有哪些\n"
            "2. 各方案的主要实现方式\n"
            "3. 现有技术存在的不足和痛点\n"
            "请用中文输出详细的分析结果。"
        )
        result = await services.ai_process(instruction, f"专利主题：{topic}")
        return {"topic": topic, "prior_art_analysis": result}

    if node_id == "search_papers":
        topic = context["topic"]
        instruction = (
            "你是一位资深学术文献分析师。请针对以下专利主题，检索并总结相关的学术论文和专利文献。\n"
            "请从以下方面进行分析：\n"
            "1. 列举3-5篇最相关的学术论文或专利（注明标题、作者/机构、发表年份）\n"
            "2. 每篇文献的核心方法和技术要点\n"
            "3. 各文献的关键结论和实验结果\n"
            "4. 这些文献中可借鉴的技术思路和启示\n"
            "5. 各文献方法的局限性\n"
            "请用中文输出详细的分析结果，确保文献信息真实可靠。"
        )
        result = await services.ai_process(instruction, f"专利主题：{topic}")
        return {
            "paper_analysis": result,
        }

    if node_id == "integrate_references":
        topic = context["topic"]
        prior_art = context["prior_art_analysis"]
        papers = context["paper_analysis"]
        instruction = (
            "你是一位资深专利分析师和技术情报专家。请将以下「现有技术分析」和「相关论文文献分析」进行结构化整合，"
            "形成一份完整的技术现状综述。\n"
            "请从以下方面进行整合：\n"
            "1. 技术演进脉络：按时间或技术代际梳理该领域的发展路径\n"
            "2. 方案交叉对照：将现有技术方案与论文方法逐项对比，标注异同点\n"
            "3. 技术空白与未解决问题：归纳现有技术和论文都尚未解决或覆盖不足的问题\n"
            "4. 技术趋势判断：基于整合结果，指出该领域的技术发展趋势\n"
            "请用中文输出结构化的整合分析结果。"
        )
        value = (
            f"专利主题：{topic}\n\n"
            f"现有技术分析：\n{prior_art}\n\n"
            f"相关论文文献分析：\n{papers}"
        )
        result = await services.ai_process(instruction, value)
        return {
            "topic": topic,
            "prior_art_analysis": prior_art,
            "paper_analysis": papers,
            "integrated_reference": result,
        }

    if node_id == "analyze_innovation":
        topic = context["topic"]
        prior_art = context["prior_art_analysis"]
        papers = context["paper_analysis"]
        integrated = context["integrated_reference"]
        instruction = (
            "你是一位资深专利分析师。基于以下整合后的技术现状综述，分析可以创新的方向。\n"
            "请从以下方面进行分析：\n"
            "1. 现有技术的核心痛点\n"
            "2. 结合技术演进脉络和技术趋势，分析可以改进和创新的方向（至少3个）\n"
            "3. 每个创新方向的潜在技术方案概述\n"
            "4. 各创新方向的技术价值和可行性评估\n"
            "5. 明确指出创新方向与已有文献方法的差异和改进点\n"
            "请用中文输出详细的分析结果。"
        )
        value = (
            f"专利主题：{topic}\n\n"
            f"整合后的技术现状综述：\n{integrated}"
        )
        result = await services.ai_process(instruction, value)
        return {
            "topic": topic,
            "prior_art_analysis": prior_art,
            "paper_analysis": papers,
            "integrated_reference": integrated,
            "innovation_analysis": result,
        }

    if node_id == "organize_solution":
        topic = context["topic"]
        prior_art = context["prior_art_analysis"]
        papers = context["paper_analysis"]
        integrated = context["integrated_reference"]
        innovation = context["innovation_analysis"]
        instruction = (
            "你是一位资深专利工程师。请基于以下信息，整理出具体的技术方案。\n"
            "请从以下方面整理具体方案：\n"
            "1. 选择最有价值的创新方向，给出完整的技术方案\n"
            "2. 系统架构设计（包括各模块及其关系）\n"
            "3. 核心算法或实现流程的详细步骤\n"
            "4. 关键技术参数和实现细节\n"
            "5. 相比现有技术和已有论文方法的优势\n"
            "6. 可能的应用场景\n"
            "7. 如适用，说明方案中对已有文献方法的借鉴和改进\n"
            "请用中文输出详细的技术方案。"
        )
        value = (
            f"专利主题：{topic}\n\n"
            f"整合后的技术现状综述：\n{integrated}\n\n"
            f"创新方向分析：\n{innovation}"
        )
        result = await services.ai_process(instruction, value)
        return {
            "topic": topic,
            "prior_art_analysis": prior_art,
            "paper_analysis": papers,
            "integrated_reference": integrated,
            "innovation_analysis": innovation,
            "technical_solution": result,
        }

    if node_id == "generate_flowchart":
        topic = context["topic"]
        solution = context["technical_solution"]
        prior_art = context.get("prior_art_analysis", "")
        papers = context.get("paper_analysis", "")
        integrated = context.get("integrated_reference", "")
        innovation = context.get("innovation_analysis", "")
        instruction = (
            "你是一位技术文档专家。请基于以下技术方案，生成一个清晰的技术流程图。\n"
            "要求：\n"
            "1. 使用 Mermaid 流程图语法（flowchart TD 或 flowchart LR）\n"
            "2. 准确反映技术方案中的核心流程和系统架构\n"
            "3. 节点命名简洁明了，用中文描述\n"
            "4. 包含主要的处理步骤、判断分支和数据流向\n"
            "5. 只输出 Mermaid 代码块，不要附加其他说明\n"
            "格式示例：\n"
            "```mermaid\nflowchart TD\n    A[步骤A] --> B[步骤B]\n    B --> C{判断条件}\n    C -->|是| D[处理D]\n    C -->|否| E[处理E]\n```"
        )
        result = await services.ai_process(instruction, f"专利主题：{topic}\n\n技术方案：\n{solution}")
        return {
            "topic": topic,
            "prior_art_analysis": prior_art,
            "paper_analysis": papers,
            "integrated_reference": integrated,
            "innovation_analysis": innovation,
            "technical_solution": solution,
            "flowchart_mermaid": result,
        }

    if node_id == "format_disclosure":
        topic = context["topic"]
        prior_art = context["prior_art_analysis"]
        papers = context["paper_analysis"]
        integrated = context["integrated_reference"]
        innovation = context["innovation_analysis"]
        solution = context["technical_solution"]
        flowchart = context["flowchart_mermaid"]
        instruction = (
            "你是一位资深专利代理师。请将以下信息整理为标准格式的专利交底书（Markdown格式）。\n"
            "请按照以下标准专利交底书格式输出：\n\n"
            "# 专利交底书\n\n"
            "## 一、发明名称\n（简洁明确的发明名称）\n\n"
            "## 二、背景技术\n（现有技术现状、存在的问题，需引用相关论文和专利文献的具体内容）\n\n"
            "## 三、发明目的\n（本发明要解决的技术问题）\n\n"
            "## 四、技术方案\n（详细的技术方案描述，包括系统架构、实现步骤、关键细节）\n\n"
            "## 五、有益效果\n（相比现有技术和已有论文方法的优势）\n\n"
            "## 六、具体实施方式\n（至少一个具体实施例）\n\n"
            "## 七、附图说明\n（在下方插入提供的技术流程图）\n\n"
            "## 八、参考文献\n（列出引用的论文和专利文献）\n\n"
            "## 九、关键词\n（3-5个技术关键词）\n\n"
            "请确保内容完整、专业、格式规范。直接输出Markdown内容，不要附加其他说明。"
        )
        value = (
            f"专利主题：{topic}\n\n"
            f"整合后的技术现状综述：\n{integrated}\n\n"
            f"创新方向分析：\n{innovation}\n\n"
            f"技术方案：\n{solution}\n\n"
            f"技术流程图（Mermaid）：\n{flowchart}"
        )
        result = await services.ai_process(instruction, value)
        return {"topic": topic, "document": result}

    if node_id == "save_document":
        topic = context["topic"]
        document = context["document"]

        clean = re.sub(r'(做一个|关于|的|专利交底书|专利|交底书)', '', topic).strip()
        if not clean:
            clean = topic

        filename = f"专利交底书_{clean}.md"
        output_dir = os.path.join(os.getcwd(), "outputs")
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(document)

        return {"file_path": filepath, "document": document}

    raise ValueError(f"Unknown work node: {node_id}")
