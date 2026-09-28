"""Kokoro-82M 中文语音合成脚本（使用项目本地模型）"""
import os

os.environ.setdefault("HF_HUB_OFFLINE", "1")

from kokoro import KPipeline, KModel
import soundfile as sf

# 项目内模型目录（已从 HF 缓存复制到此处）
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "Kokoro-82M")

OUT_DIR = "output"
os.makedirs(OUT_DIR, exist_ok=True)


def load_pipeline():
    """从本地路径加载模型，不访问 HuggingFace Hub"""
    kmodel = KModel(
        config=os.path.join(MODEL_DIR, "config.json"),
        model=os.path.join(MODEL_DIR, "kokoro-v1_0.pth"),
    )
    return KPipeline(lang_code="z", model=kmodel)


def main():
    pipeline = load_pipeline()

    text = os.environ.get("TTS_TEXT", "这是测试语音")
    voice = os.path.join(MODEL_DIR, "voices", "zf_xiaobei.pt")

    generator = pipeline(text, voice=voice, speed=1)

    saved = []
    for i, (gs, ps, audio) in enumerate(generator):
        path = os.path.join(OUT_DIR, f"output_{i}.wav")
        sf.write(path, audio, 24000)
        saved.append(path)
        print(f"[{i}] 已生成: {path}")

    print(f"\n完成！共生成 {len(saved)} 个音频文件")
    for p in saved:
        print(" -", p)


if __name__ == "__main__":
    main()
