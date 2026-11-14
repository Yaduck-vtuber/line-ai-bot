#!/usr/bin/env python3
"""自動從 Cloud Run 歷史版本 (Revisions) 找回先前設定過的 LINE 與 Gemini 金鑰，避免部署時遺失"""
import json
import subprocess
import sys


def main():
    try:
        out = subprocess.check_output(
            [
                "gcloud", "run", "revisions", "list",
                "--service", "line-ai-bot",
                "--region", "asia-east1",
                "--format=json",
            ],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        revs = json.loads(out)
    except Exception:
        revs = []

    recovered = {}
    target_keys = {
        "LINE_CHANNEL_SECRET",
        "LINE_CHANNEL_ACCESS_TOKEN",
        "GEMINI_API_KEY",
        "ADMIN_LINE_USER_ID",
        "ADMIN_MASTER_PASSWORD",
    }

    for rev in revs:
        containers = (
            rev.get("spec", {}).get("containers")
            or rev.get("spec", {}).get("template", {}).get("spec", {}).get("containers")
            or []
        )
        for c in containers:
            for env_item in c.get("env", []):
                k = env_item.get("name", "")
                v = env_item.get("value", "")
                if k in target_keys and v and k not in recovered:
                    recovered[k] = v

    recovered["FORCE_DEPLOY_VER"] = "20261114_v2"
    # 輸出給 gcloud --env-vars-file 使用的 YAML 格式
    with open(".cloudrun_env.yaml", "w", encoding="utf-8") as f:
        for k, v in recovered.items():
            safe_v = str(v).replace("\\", "\\\\").replace('"', '\\"')
            f.write(f'{k}: "{safe_v}"\n')

    found_keys = [k for k in recovered if k != "FORCE_DEPLOY_VER"]
    if found_keys:
        print(f"✅ 已自動從歷史版本找回金鑰：{', '.join(found_keys)}")
    else:
        print("ℹ️ 歷史版本未偵測到舊金鑰，部署後可直接於 /admin 後台網頁貼上金鑰。")


if __name__ == "__main__":
    main()
