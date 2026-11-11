import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

// hCaptcha site key. Login requires the check only when this is set; it must
// match the hCaptcha secret configured in Supabase Auth (Attack Protection).
// The site key is public, so it is kept here rather than in build settings.
const HCAPTCHA_SITE_KEY = "89d8b814-e91a-430a-8ca0-95f89142c5fc";

export const CAPTCHA_SITE_KEY =
  process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY || HCAPTCHA_SITE_KEY;

// The page origin hCaptcha sees. It must be in the site key's allowed
// domains, so it uses the SIRA web domain.
const CAPTCHA_BASE_URL = "https://sira-web-iota.vercel.app";

// The checkbox fits in a short strip; a picture challenge needs room, so the
// widget grows while one is open.
const CHECKBOX_HEIGHT = 84;
const CHALLENGE_HEIGHT = 580;

function captchaHtml(siteKey: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
  html, body { margin: 0; background: transparent; }
  body { display: flex; justify-content: center; padding-top: 3px; }
</style>
<script src="https://js.hcaptcha.com/1/api.js?onload=onCaptchaLoad&render=explicit" async defer></script>
</head>
<body>
<div id="captcha"></div>
<script>
  function send(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function onCaptchaLoad() {
    hcaptcha.render("captcha", {
      sitekey: ${JSON.stringify(siteKey)},
      callback: function (token) { send({ type: "token", token: token }); },
      "expired-callback": function () { send({ type: "expired" }); },
      "chalexpired-callback": function () { send({ type: "expired" }); },
      "open-callback": function () { send({ type: "open" }); },
      "close-callback": function () { send({ type: "close" }); },
      "error-callback": function (error) { send({ type: "error", error: String(error) }); }
    });
  }
</script>
</body>
</html>`;
}

type CaptchaWidgetProps = {
  onToken: (token: string | null) => void;
  onError: (message: string) => void;
};

// Inline hCaptcha checkbox. Remount it (change its key) to get a fresh check,
// since each token can be used for one sign-in only.
export default function CaptchaWidget({ onToken, onError }: CaptchaWidgetProps) {
  const [challengeOpen, setChallengeOpen] = useState(false);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        token?: string;
      };

      if (message.type === "open") setChallengeOpen(true);
      else if (message.type === "close") setChallengeOpen(false);
      else if (message.type === "token" && message.token) {
        setChallengeOpen(false);
        onToken(message.token);
      } else if (message.type === "expired") onToken(null);
      else if (message.type === "error") {
        setChallengeOpen(false);
        onToken(null);
        onError("Security check could not be completed. Please try again.");
      }
    } catch {
      // Ignore messages that are not from the captcha page.
    }
  }

  return (
    <View style={[styles.frame, { height: challengeOpen ? CHALLENGE_HEIGHT : CHECKBOX_HEIGHT }]}>
      <WebView
        style={styles.webView}
        originWhitelist={["*"]}
        source={{ html: captchaHtml(CAPTCHA_SITE_KEY), baseUrl: CAPTCHA_BASE_URL }}
        onMessage={handleMessage}
        onError={() => onError("Security check could not be loaded. Check your connection.")}
        javaScriptEnabled
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginTop: 14,
    overflow: "hidden",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
