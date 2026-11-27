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
    `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`,
    `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`,
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

  // Enforce HTTPS-only traffic & hardware acceleration at the Activity/Application layer
  if (!xml.includes("android:usesCleartextTraffic")) {
    xml = xml.replace(/<application\b/, '<application android:usesCleartextTraffic="false"');
  }
  if (!xml.includes("android:hardwareAccelerated")) {
    xml = xml.replace(/<application\b/, '<application android:hardwareAccelerated="true"');
  }

  // Declare optional GPS hardware feature so Wi-Fi-only tablets can still install from Play Store
  if (!xml.includes("android.hardware.location.gps")) {
    xml = xml.replace(
      /<\/manifest>/i,
      '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>'
    );
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

  // Add tournyx.in + app.tournyx.in App Links deep-link filter
  if (!xml.includes('android:host="tournyx.in"')) {
    const deepLinkFilter = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="tournyx.in" />
                <data android:scheme="https" android:host="www.tournyx.in" />
                <data android:scheme="https" android:host="app.tournyx.in" />
            </intent-filter>`;
    xml = xml.replace(/(<\/intent-filter>)/, `$1${deepLinkFilter}`);
  } else if (!xml.includes('android:host="app.tournyx.in"')) {
    xml = xml.replace(
      /<data android:scheme="https" android:host="www\.tournyx\.in" \/>/,
      '<data android:scheme="https" android:host="www.tournyx.in" />\n                <data android:scheme="https" android:host="app.tournyx.in" />'
    );
  }

  fs.writeFileSync(manifestPath, xml, "utf8");
  console.log("✅ Patched AndroidManifest.xml (Location, Mic, Camera, Game Queries & App Links).");

  // 2. Patch MainActivity.java (Zero-White-Flash + Runtime Geolocation Prompt + Direct Game Launcher)
  const mainActPath = path.join(ROOT, "android", "app", "src", "main", "java", "in", "tournyx", "app", "MainActivity.java");
  if (fs.existsSync(mainActPath)) {
    const javaSource = `package in.tournyx.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final int REQ_LOCATION_PERM = 9041;
    private static final int OBSIDIAN_BG = Color.parseColor("#050508");

    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.dts.freefiremax",
        "com.dts.freefireth",
        "com.pubg.imobile",
        "com.activision.callofduty.shooter",
        "com.whatsapp",
        "com.whatsapp.w4b"
    ));

    private static final Set<String> TRUSTED_GEO_HOSTS = new HashSet<>(Arrays.asList(
        "app.tournyx.in",
        "tournyx.in",
        "www.tournyx.in",
        "localhost"
    ));

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Lock native window surface to #050508 to eliminate white flashes on boot and navigation
        if (getWindow() != null) {
            getWindow().getDecorView().setBackgroundColor(OBSIDIAN_BG);
            getWindow().setStatusBarColor(OBSIDIAN_BG);
            getWindow().setNavigationBarColor(OBSIDIAN_BG);
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.setBackgroundColor(OBSIDIAN_BG);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

            WebSettings settings = webView.getSettings();
            settings.setGeolocationEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setMediaPlaybackRequiresUserGesture(false);

            // Preserve Capacitor's BridgeWebChromeClient (file upload, mic, fullscreen) + handle Geolocation cleanly
            webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    if (!isTrustedGeoOrigin(origin)) {
                        callback.invoke(origin, false, false);
                        return;
                    }

                    boolean fine = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
                    boolean coarse = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;

                    if (fine || coarse) {
                        callback.invoke(origin, true, false);
                    } else {
                        pendingGeoCallback = callback;
                        pendingGeoOrigin = origin;
                        ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            },
                            REQ_LOCATION_PERM
                        );
                    }
                }
            });

            // Direct allowlisted Android Game Launcher (no Play Store redirect when game is installed)
            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (uri == null) return super.shouldOverrideUrlLoading(view, request);

                    String url = uri.toString();
                    String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";

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

    private boolean isTrustedGeoOrigin(String origin) {
        if (origin == null || origin.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(origin);
            String host = uri.getHost();
            return host != null && TRUSTED_GEO_HOSTS.contains(host.toLowerCase());
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        if (requestCode == REQ_LOCATION_PERM && pendingGeoCallback != null) {
            boolean granted = false;
            for (int r : grantResults) {
                if (r == PackageManager.PERMISSION_GRANTED) {
                    granted = true;
                    break;
                }
            }
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }
}
`;
    fs.writeFileSync(mainActPath, javaSource, "utf8");
    console.log("✅ Patched MainActivity.java (Zero-White-Flash, Geolocation Prompt & Game Launcher).");
  }

  // 3. Patch Obsidian #050508 Theme in styles.xml (Zero White Flash)
  const stylesPath = path.join(ROOT, "android", "app", "src", "main", "res", "values", "styles.xml");
  if (fs.existsSync(stylesPath)) {
    let stylesXml = fs.readFileSync(stylesPath, "utf8");
    if (!stylesXml.includes("#050508")) {
      stylesXml = stylesXml.replace(
        /<item name="android:background">@null<\/item>/,
        '<item name="android:windowBackground">#050508</item>\n        <item name="android:background">#050508</item>\n        <item name="android:statusBarColor">#050508</item>\n        <item name="android:navigationBarColor">#050508</item>\n        <item name="android:windowLightStatusBar">false</item>'
      );
      fs.writeFileSync(stylesPath, stylesXml, "utf8");
      console.log("✅ Patched Android styles.xml (#050508 Obsidian launch theme).");
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

  if (!plist.includes("NSLocationWhenInUseUsageDescription")) {
    additions.push(`
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>Tournyx Esports uses your location during login for regional tournament eligibility and fair-play verification.</string>`);
  }
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
  if (!plist.includes("UIUserInterfaceStyle")) {
    additions.push(`
	<key>UIUserInterfaceStyle</key>
	<string>Dark</string>`);
  }
  if (!plist.includes("CADisableMinimumFrameDurationOnPhone")) {
    additions.push(`
	<key>CADisableMinimumFrameDurationOnPhone</key>
	<true/>`);
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
    console.log("✅ Patched iOS Info.plist (Location, Mic, Camera, Dark Liquid Glass & 120Hz ProMotion).");
  }

  // Lock dark Obsidian window background inside AppDelegate.swift (eliminates iOS white flash)
  const appDelegatePath = path.join(ROOT, "ios", "App", "App", "AppDelegate.swift");
  if (fs.existsSync(appDelegatePath)) {
    let swift = fs.readFileSync(appDelegatePath, "utf8");
    if (!swift.includes("overrideUserInterfaceStyle")) {
      swift = swift.replace(
        /func application\(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\?\) -> Bool \{/,
        `func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window?.backgroundColor = UIColor(red: 5.0/255.0, green: 5.0/255.0, blue: 8.0/255.0, alpha: 1.0)
        window?.overrideUserInterfaceStyle = .dark`
      );
      fs.writeFileSync(appDelegatePath, swift, "utf8");
      console.log("✅ Patched iOS AppDelegate.swift (Dark #050508 Liquid Glass window surface).");
    }
  }
}

if (target === "android") patchAndroid();
else if (target === "ios") patchIOS();
else {
  patchAndroid();
  patchIOS();
}
