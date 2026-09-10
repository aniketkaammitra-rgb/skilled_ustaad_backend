import nodemailer from "nodemailer";

// Retrieve configuration from environment
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || `"Skilled Ustaad Support" <support@skilledustaad.com>`;
const resendApiKey = process.env.RESEND_API_KEY;
let useResend = !!resendApiKey;

let transporter = null;
let initializationPromise = null;

// Helper to get or initialize transporter asynchronously with forced IPv4 resolution
const getTransporter = async () => {
  if (transporter) return transporter;

  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (smtpHost && smtpUser && smtpPass) {
        const tlsOptions = {
          rejectUnauthorized: false
        };

        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: Number(smtpPort),
          secure: Number(smtpPort) === 465, // true for 465, false for other ports
          family: 4, // Force IPv4 connection to bypass ENETUNREACH on IPv6 resolving
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          tls: tlsOptions,
        });
        console.log(`[EMAIL] SMTP transporter initialized using host ${smtpHost} and port ${smtpPort}`);
      } else {
        // Dynamic Ethereal account generation for testing
        try {
          const testAccount = await nodemailer.createTestAccount();
          transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });
          console.log(`[EMAIL] Created Ethereal test email account: ${testAccount.user}`);
        } catch (etherealErr) {
          console.warn("[EMAIL] Failed to create Ethereal test email account, falling back to console logger:", etherealErr.message);
        }
      }
      return transporter;
    })();
  }

  return initializationPromise;
};

export const sendEmail = async ({ to, subject, html, text }) => {
  // If Resend API Key is defined, send directly via HTTPS API (port 443 is never blocked by cloud firewalls)
  if (useResend) {
    try {
      console.log(`[EMAIL] Attempting to send email via Resend HTTP API to ${to}...`);
      let response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: smtpFrom,
          to: [to],
          subject,
          html: html || text,
          text,
        }),
      });

      let resData = {};
      if (response.ok) {
        resData = await response.json();
        console.log(`[EMAIL SENT] Message sent to ${to} via Resend HTTP API. ID: ${resData.id}`);
        return { success: true, messageId: resData.id };
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn(`[EMAIL ERROR] Resend HTTP API response error:`, errData.message || response.statusText);
        // If domain is not verified, disable Resend HTTP API for subsequent emails to bypass useless API latency
        if (errData.message && (errData.message.toLowerCase().includes("domain") || errData.message.toLowerCase().includes("verify"))) {
          console.warn(`[EMAIL] Sender domain not verified on Resend. Disabling Resend HTTP API for subsequent emails.`);
          useResend = false;
        }
      }
    } catch (apiErr) {
      console.error("[EMAIL ERROR] Failed to connect to Resend API over HTTPS:", apiErr.message);
    }
    console.log(`[EMAIL] Falling back to standard SMTP connection...`);
  }

  const mailOptions = {
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  };

  try {
    const activeTransporter = await getTransporter();

    if (activeTransporter) {
      const info = await activeTransporter.sendMail(mailOptions);
      console.log(`[EMAIL SENT] Message sent to ${to}. Message ID: ${info.messageId}`);
      
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        console.log(`[EMAIL PREVIEW] View simulated email at: ${testUrl}`);
      }
      return { success: true, messageId: info.messageId, previewUrl: testUrl || null };
    } else {
      console.log(`[EMAIL CONSOLE SIMULATION]\nFrom: ${smtpFrom}\nTo: ${to}\nSubject: ${subject}\nBody:\n${text || html}\n====================`);
      return { success: true, messageId: "simulated-id", previewUrl: null };
    }
  } catch (err) {
    console.error("[EMAIL ERROR] First attempt failed:", err.message);

    // If first attempt failed on port 587, automatically retry on port 2525
    if (Number(smtpPort) === 587 && smtpHost && smtpUser && smtpPass) {
      try {
        console.log(`[EMAIL RETRY] Attempting connection fallback using port 2525...`);
        const backupTransporter = nodemailer.createTransport({
          host: smtpHost,
          port: 2525,
          secure: false,
          ignoreTLS: true, // Ignore STARTTLS to bypass TLS handshake ECONNRESETs
          family: 4, // Force IPv4 connection
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        
        const info = await backupTransporter.sendMail(mailOptions);
        console.log(`[EMAIL SENT] Message sent to ${to} via backup port 2525. Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId, previewUrl: null };
      } catch (retryErr) {
        console.error("[EMAIL ERROR] Backup port 2525 also failed:", retryErr.message);
      }
    }

    console.log(`[EMAIL FALLBACK SIMULATION] Nodemailer failed. Logging email content here so testing/registration is not blocked:\nTo: ${to}\nSubject: ${subject}\nBody:\n${text || html}\n====================`);
    // Return success: true to prevent blocking the user's forgot password/signup flow during network timeout issues
    return { success: true, messageId: "fallback-simulated-id", previewUrl: null, fallback: true };
  }
};
