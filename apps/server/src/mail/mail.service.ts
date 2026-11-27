import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";

const DEFAULT_EMAIL_FROM = "Collab Board <onboarding@resend.dev>";

export interface WorkspaceInvitationEmailInput {
  /** Recipient email address. */
  to: string;
  /** Display name of the user who sent the invitation. */
  inviterName: string;
  /** Name of the workspace the invitation grants access to. */
  organizationName: string;
  /** Frontend landing page that accepts `invitation.id`. */
  invitationUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInvitationHtml(input: WorkspaceInvitationEmailInput): string {
  const inviter = escapeHtml(input.inviterName);
  const organization = escapeHtml(input.organizationName);
  const url = escapeHtml(input.invitationUrl);

  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:32px 16px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <tr>
        <td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 8px;font-size:20px;line-height:1.4;">邀请你加入 ${organization}</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;">
            <strong>${inviter}</strong> 邀请你加入工作区 <strong>${organization}</strong>。
          </p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.7;color:#6b7280;">
            <strong>${inviter}</strong> invited you to join the workspace <strong>${organization}</strong>.
          </p>
          <a href="${url}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
            接受邀请 / Accept invitation
          </a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:#9ca3af;">
            若按钮无法点击，请复制以下链接到浏览器打开：<br />
            <span style="word-break:break-all;">${url}</span>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 32px;">
          <p style="margin:0;font-size:12px;line-height:1.7;color:#9ca3af;">
            如果你不认识邀请人，可以忽略此邮件。<br />
            If you were not expecting this invitation, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /**
   * Sends the workspace invitation through Resend when `RESEND_API_KEY` is
   * configured; otherwise falls back to logging the invitation link so local
   * development works without an email provider.
   */
  async sendWorkspaceInvitationEmail(input: WorkspaceInvitationEmailInput): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (!apiKey) {
      this.logFallback(input);
      return;
    }

    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;

    try {
      const { error } = await new Resend(apiKey).emails.send({
        from,
        to: input.to,
        subject: `${input.inviterName} 邀请你加入 ${input.organizationName} / Invitation to ${input.organizationName}`,
        html: buildInvitationHtml(input),
      });

      if (error) {
        this.logger.error(`Resend 发送邀请邮件失败：${error.message}`);
        this.logFallback(input);
        return;
      }

      this.logger.log(`邀请邮件已发送至 ${input.to}（工作区：${input.organizationName}）`);
    } catch (error) {
      this.logger.error(`Resend 发送邀请邮件异常：${(error as Error).message}`);
      this.logFallback(input);
    }
  }

  private logFallback(input: WorkspaceInvitationEmailInput): void {
    this.logger.log(
      [
        "",
        "==================== 工作区邀请（本地开发模式，未配置 RESEND_API_KEY） ====================",
        `收件人 / To:       ${input.to}`,
        `邀请人 / Inviter:  ${input.inviterName}`,
        `工作区 / Workspace: ${input.organizationName}`,
        `接受链接 / Link:    ${input.invitationUrl}`,
        "==========================================================================================",
        "",
      ].join("\n"),
    );
  }
}
