# Vercel Environment Variables Setup

以下の環境変数をVercelダッシュボードのProduction環境に設定してください：

## Settings > Environment Variables > Add New

1. **GOOGLE_APPLICATION_CREDENTIALS** (Type: Encrypted)
   - Value: (JSON file content from /Users/kudo/AutoStudio/secrets/mark-454114-bf1f1fa80b94.json)

2. **THREADS_TOKEN** (Type: Encrypted)
   - Value: THAAKXd7vmUZAFBUVR6SHYta2lrQVF2THNxN05BaUt3a3BrMFRkcmlvcm95dWpkUXQ0RHlmT2VuM0RZASXd6bzl0eW1kZAXd1Ml9WVjA5RnFhSFYybTZA1OEhYcXBidVdmQlpIWFpULTFLdjVBR3hBOVczc05VY3ZA5amF0YUhQbldUMVpuY3pkN2lfSDZAITG9iLVEZD

3. **THREADS_BUSINESS_ID**
   - Value: 10012809578833342

4. **THREADS_ACCOUNT_ID**
   - Value: kudooo_sns.marke

5. **CLAUDE_API_KEY** (Type: Encrypted)
   - Value: sk-ant-api03-Qq2N4bLbLmHQGF8T3HAoYX3QOsf7SWl6TM2HUc6TVnrIsH3-V7uS8F9B1w6wrVAXQB18i7Zdc-2Q5w29Ik03xQ-qyZFtQAQ

6. **CLAUDE_MODEL**
   - Value: claude-3-5-sonnet-20240620

7. **CLAUDE_API_URL**
   - Value: https://api.anthropic.com/v1/messages

8. **BQ_PROJECT_ID**
   - Value: mark-454114

9. **ALERT_EMAIL_ENABLED**
   - Value: true

10. **ALERT_EMAIL_TO**
    - Value: dodo.inc.kudo@gmail.com

## 設定完了後
Settings > Git > Redeploy から最新コミットを再デプロイしてください。