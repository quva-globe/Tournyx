import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const target = (process.argv[2] || "all").toLowerCase();

const ALLOWED_GAME_PACKAGES = [
  "com.dts.freefiremax",
  "com.dts.freefireth",
  "com.pubg.imobile",
  "com.activision.callofduty.shooter",
  "com.whatsapp",
  "com.whatsapp.w4b"
];

function patchAndroid() {
  const manifestPath = path.join(ROOT, "android", "app", "src", "main", "AndroidManifest.xml");
  if (!fs.existsSync(manifestPath)) {
    console.warn("⚠️ Android project not found yet. Run 'npx cap add android' first.");
    return;
  }

  // 1. Patch AndroidManifest.xml (Idempotent)
  let xml = fs.readFileSync(manifestPath, "utf8");

  const requiredPermissions = [
    `<uses-permission android:name="android.permission.INTERNET" />`,
    `<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />`,
    `<uses-permission android:name="android.permission.RECORD_AUDIO" />`,
    `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`,
    `<uses-permission android:name="android.permission.CAMERA" />`,
    `<uses-permission android:name="android.permission.VIBRATE" />`,
    `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`,
    `<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />`,
    `<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />`,
    `<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />`
  ];

  const missingPerms = requiredPermissions.filter((line) => {
    const m = line.match(/android:name="([^"]+)"/);
    return m && !xml.includes(m[1]);
  });

  if (missingPerms.length > 0) {
    xml = xml.replace(/<\/manifest>/i, `    ${missingPerms.join("\n    ")}\n</manifest>`);
  }

  // Enforce HTTPS-only cleartext policy
  if (!xml.includes("android:usesCleartextTraffic")) {
    xml = xml.replace(/<application\b/, '<application android:usesCleartextTraffic="false"');
  }

  // Add Android 11+ <queries> block for direct game launching
  if (!xml.includes("com.dts.freefiremax")) {
    const queriesBlock = `
    <queries>
        ${ALLOWED_GAME_PACKAGES.map((pkg) => `<package android:name="${pkg}" />`).join("\n        ")}
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
    </queries>`;
    xml = xml.replace(/<\/manifest>/i, `${queriesBlock}\n</manifest>`);
  }

  // Add tournyx.in App Links deep-link filter to MainActivity
  if (!xml.includes('android:host="tournyx.in"')) {
    const deepLinkFilter = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="tournyx.in" />
                <data android:scheme="https" android:host="www.tournyx.in" />
            </intent-filter>`;
    xml = xml.replace(/(<\/intent-filter>)/, `$1${deepLinkFilter}`);
  }

  fs.writeFileSync(manifestPath, xml, "utf8");
  console.log("✅ Patched AndroidManifest.xml (permissions, game <queries>, deep links).");

  // 2. Patch MainActivity.java (Direct Allowlisted Game Launcher Intent Bridge)
  const mainActPath = path.join(ROOT, "android", "app", "src", "main", "java", "in", "tournyx", "app", "MainActivity.java");
  if (fs.existsSync(mainActPath)) {
    const javaSource = `package in.tournyx.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.dts.freefiremax",
        "com.dts.freefireth",
        "com.pubg.imobile",
        "com.activision.callofduty.shooter",
        "com.whatsapp",
        "com.whatsapp.w4b"
    ));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (uri == null) return super.shouldOverrideUrlLoading(view, request);

                    String url = uri.toString();
                    String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";

                    // 1. Direct Android Game Intents (Opens Installed Game Immediately — No Play Store Redirect)
                    if ("intent".equals(scheme)) {
                        try {
                            Intent parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                            if (parsed != null) {
                                String pkg = parsed.getPackage();
                                if (pkg != null && ALLOWED_PACKAGES.contains(pkg)) {
                                    Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
                                    if (launch != null) {
                                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        startActivity(launch);
                                        return true;
                                    }
                                    // Only open Play Store if the game is genuinely not installed on this phone
                                    Intent store = new Intent(Intent.ACTION_VIEW,
                                        Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
                                    store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    startActivity(store);
                                    return true;
                                }
                            }
                        } catch (Exception ignored) {}
                        return true;
                    }

                    // 2. Direct Custom App Schemes (WhatsApp, Phone, Email, Game Deep Links)
                    if ("whatsapp".equals(scheme) || "tel".equals(scheme) || "mailto".equals(scheme)
                        || "freefiremax".equals(scheme) || "freefireth".equals(scheme)
                        || "pubg".equals(scheme) || "cod".equals(scheme)) {
                        try {
                            Intent ext = new Intent(Intent.ACTION_VIEW, uri);
                            ext.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(ext);
                        } catch (Exception ignored) {}
                        return true;
                    }

                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
`;
    fs.writeFileSync(mainActPath, javaSource, "utf8");
    console.log("✅ Patched MainActivity.java (allowlisted direct game launcher active).");
  }

  // 3. Patch Obsidian #050508 Launch Background in styles.xml (Zero White Flash)
  const stylesPath = path.join(ROOT, "android", "app", "src", "main", "res", "values", "styles.xml");
  if (fs.existsSync(stylesPath)) {
    let stylesXml = fs.readFileSync(stylesPath, "utf8");
    if (!stylesXml.includes("#050508")) {
      stylesXml = stylesXml.replace(
        /<item name="android:background">@null<\/item>/,
        '<item name="android:background">#050508</item>\n        <item name="android:statusBarColor">#050508</item>\n        <item name="android:navigationBarColor">#050508</item>'
      );
      fs.writeFileSync(stylesPath, stylesXml, "utf8");
      console.log("✅ Patched Android styles.xml (#050508 Obsidian launch background).");
    }
  }
}

function patchIOS() {
  const plistPath = path.join(ROOT, "ios", "App", "App", "Info.plist");
  if (!fs.existsSync(plistPath)) {
    console.warn("⚠️ iOS project not found yet. Run 'npx cap add ios' first.");
    return;
  }

  let plist = fs.readFileSync(plistPath, "utf8");
  const additions = [];

  if (!plist.includes("NSMicrophoneUsageDescription")) {
    additions.push(`
	<key>NSMicrophoneUsageDescription</key>
	<string>Tournyx Esports uses your microphone for live Squad Voice comms.</string>`);
  }
  if (!plist.includes("NSCameraUsageDescription")) {
    additions.push(`
	<key>NSCameraUsageDescription</key>
	<string>Tournyx Esports uses your camera to capture profile avatars and match proof.</string>`);
  }
  if (!plist.includes("NSPhotoLibraryUsageDescription")) {
    additions.push(`
	<key>NSPhotoLibraryUsageDescription</key>
	<string>Tournyx Esports accesses your library so you can upload clutch reels, posters, and thumbnails.</string>`);
  }
  if (!plist.includes("NSPhotoLibraryAddUsageDescription")) {
    additions.push(`
	<key>NSPhotoLibraryAddUsageDescription</key>
	<string>Tournyx Esports saves E-Certificates and match entry passes to your device.</string>`);
  }
  if (!plist.includes("LSApplicationQueriesSchemes")) {
    additions.push(`
	<key>LSApplicationQueriesSchemes</key>
	<array>
		<string>freefiremax</string>
		<string>freefireth</string>
		<string>pubg</string>
		<string>cod</string>
		<string>whatsapp</string>
	</array>`);
  }

  if (additions.length > 0) {
    plist = plist.replace(/<\/dict>\s*<\/plist>/i, `${additions.join("\n")}\n</dict>\n</plist>`);
    fs.writeFileSync(plistPath, plist, "utf8");
    console.log("✅ Patched iOS Info.plist (Mic, Camera, Photos & Game Schemes).");
  }
}

if (target === "android") patchAndroid();
else if (target === "ios") patchIOS();
else {
  patchAndroid();
  patchIOS();
}
