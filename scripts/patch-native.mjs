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

  // 1. Patch AndroidManifest.xml
  let xml = fs.readFileSync(manifestPath, "utf8");

  const requiredPermissions = [
    `<uses-permission android:name="android.permission.INTERNET" />`,
    `<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />`,
    `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`,
    `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`,
    `<uses-permission android:name="android.permission.RECORD_AUDIO" />`,
    `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`,
    `<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />`,
    `<uses-permission android:name="android.permission.CAMERA" />`,
    `<uses-permission android:name="android.permission.VIBRATE" />`,
    `<uses-permission android:name="android.permission.WAKE_LOCK" />`,
    `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`,
    `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`,
    `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />`,
    `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />`,
    `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />`,
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

  if (!xml.includes("android:usesCleartextTraffic")) {
    xml = xml.replace(/<application\b/, '<application android:usesCleartextTraffic="false"');
  }
  if (!xml.includes("android:hardwareAccelerated")) {
    xml = xml.replace(/<application\b/, '<application android:hardwareAccelerated="true"');
  }
  if (!xml.includes("android.hardware.location.gps")) {
    xml = xml.replace(
      /<\/manifest>/i,
      '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>'
    );
  }

  if (!xml.includes("TournyxVoiceService")) {
    const serviceDecl = `
        <service
            android:name=".TournyxVoiceService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="microphone|mediaPlayback|mediaProjection" />`;
    xml = xml.replace(/<\/application>/i, `${serviceDecl}\n    </application>`);
  }

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
  }

  if (!xml.includes('android:scheme="in.tournyx.app"')) {
    const oauthFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="in.tournyx.app" android:host="auth" />
            </intent-filter>`;
    xml = xml.replace(/(<\/intent-filter>)/, `$1${oauthFilter}`);
  }

  fs.writeFileSync(manifestPath, xml, "utf8");
  console.log("✅ Patched AndroidManifest.xml.");

  const javaDir = path.join(ROOT, "android", "app", "src", "main", "java", "in", "tournyx", "app");
  fs.mkdirSync(javaDir, { recursive: true });

  // 2. Write TournyxVoiceService.java
  const voiceServiceSource = String.raw`package in.tournyx.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class TournyxVoiceService extends Service {
    public static final String CHANNEL_ID = "tournyx_squad_voice_channel";
    public static final int NOTIF_ID = 7071;

    public static final String ACTION_START = "in.tournyx.app.VOICE_START";
    public static final String ACTION_UPDATE = "in.tournyx.app.VOICE_UPDATE";
    public static final String ACTION_ENABLE_PROJECTION = "in.tournyx.app.VOICE_ENABLE_PROJECTION";
    public static final String ACTION_DISABLE_PROJECTION = "in.tournyx.app.VOICE_DISABLE_PROJECTION";
    public static final String ACTION_TOGGLE_MUTE = "in.tournyx.app.VOICE_TOGGLE_MUTE";
    public static final String ACTION_TOGGLE_SPEAKER = "in.tournyx.app.VOICE_TOGGLE_SPEAKER";
    public static final String ACTION_HANGUP = "in.tournyx.app.VOICE_HANGUP";
    public static final String ACTION_STOP = "in.tournyx.app.VOICE_STOP";
    public static final String BROADCAST_VOICE_EVENT = "in.tournyx.app.VOICE_EVENT";

    private String roomName = "Tournyx Squad Voice";
    private boolean isMuted = false;
    private boolean isSpeaker = true;
    private boolean isProjectionActive = false;

    private AudioManager audioManager;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (intent != null && intent.hasExtra("roomName")) {
            String rn = intent.getStringExtra("roomName");
            if (rn != null && !rn.trim().isEmpty()) roomName = rn.trim();
        }

        if (ACTION_STOP.equals(action)) {
            teardownAndStop();
            return START_NOT_STICKY;
        }
        if (ACTION_HANGUP.equals(action)) {
            sendEventToApp("leave", isMuted, isSpeaker);
            teardownAndStop();
            return START_NOT_STICKY;
        }
        if (ACTION_TOGGLE_MUTE.equals(action)) {
            isMuted = !isMuted;
            updateNotification();
            sendEventToApp("mute", isMuted, isSpeaker);
            return START_STICKY;
        }
        if (ACTION_TOGGLE_SPEAKER.equals(action)) {
            isSpeaker = !isSpeaker;
            applyAudioRouting(isSpeaker);
            updateNotification();
            sendEventToApp("speaker", isMuted, isSpeaker);
            return START_STICKY;
        }
        if (ACTION_UPDATE.equals(action)) {
            if (intent != null) {
                isMuted = intent.getBooleanExtra("muted", isMuted);
                isSpeaker = intent.getBooleanExtra("speaker", isSpeaker);
            }
            applyAudioRouting(isSpeaker);
            updateNotification();
            return START_STICKY;
        }
        if (ACTION_ENABLE_PROJECTION.equals(action)) {
            isProjectionActive = true;
            acquireWakeLockAndAudio();
            promoteForeground(true);
            return START_STICKY;
        }
        if (ACTION_DISABLE_PROJECTION.equals(action)) {
            isProjectionActive = false;
            promoteForeground(false);
            return START_STICKY;
        }

        acquireWakeLockAndAudio();
        applyAudioRouting(isSpeaker);
        promoteForeground(isProjectionActive);
        return START_STICKY;
    }

    private void acquireWakeLockAndAudio() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Tournyx::SquadVoiceWakeLock");
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(4 * 60 * 60 * 1000L);
        } catch (Exception ignored) {}
        try {
            if (audioManager != null) audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        } catch (Exception ignored) {}
    }

    private void applyAudioRouting(boolean speakerOn) {
        try {
            if (audioManager != null) {
                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                audioManager.setSpeakerphoneOn(speakerOn);
            }
        } catch (Exception ignored) {}
    }

    private void promoteForeground(boolean includeProjection) {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int fgsTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            boolean hasMic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
            if (hasMic && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                fgsTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            }
            if (includeProjection) {
                fgsTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
            }
            try {
                startForeground(NOTIF_ID, notification, fgsTypes);
            } catch (Exception e) {
                startForeground(NOTIF_ID, notification);
            }
        } else {
            startForeground(NOTIF_ID, notification);
        }
    }

    private void updateNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification());
        } catch (Exception ignored) {}
    }

    private Notification buildNotification() {
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("open_room", true);
        PendingIntent openPi = PendingIntent.getActivity(this, 100, openIntent, piFlags);

        Intent muteIntent = new Intent(this, TournyxVoiceService.class).setAction(ACTION_TOGGLE_MUTE);
        PendingIntent mutePi = PendingIntent.getService(this, 101, muteIntent, piFlags);

        Intent spkIntent = new Intent(this, TournyxVoiceService.class).setAction(ACTION_TOGGLE_SPEAKER);
        PendingIntent spkPi = PendingIntent.getService(this, 102, spkIntent, piFlags);

        Intent hangupIntent = new Intent(this, TournyxVoiceService.class).setAction(ACTION_HANGUP);
        PendingIntent hangupPi = PendingIntent.getService(this, 103, hangupIntent, piFlags);

        String statusText = (isProjectionActive ? "Screen Sharing • " : "Voice Connected • ")
            + (isMuted ? "Mic Muted" : "Mic Live")
            + (isSpeaker ? " • Speaker" : " • Earpiece");

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(roomName)
            .setContentText(statusText)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openPi)
            .addAction(0, isMuted ? "Unmute" : "Mute", mutePi)
            .addAction(0, isSpeaker ? "Earpiece" : "Speaker", spkPi)
            .addAction(0, "Hang Up", hangupPi)
            .build();
    }

    private void sendEventToApp(String actionName, boolean muted, boolean speaker) {
        Intent evt = new Intent(BROADCAST_VOICE_EVENT);
        evt.setPackage(getPackageName());
        evt.putExtra("action", actionName);
        evt.putExtra("muted", muted);
        evt.putExtra("speaker", speaker);
        sendBroadcast(evt);
    }

    private void teardownAndStop() {
        isProjectionActive = false;
        try {
            if (audioManager != null) {
                audioManager.setSpeakerphoneOn(false);
                audioManager.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception ignored) {}
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        stopForeground(true);
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Tournyx Squad Voice", NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("Keeps Clan Voice and Screen Sharing live while playing games");
            ch.setSound(null, null);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    @Override
    public void onDestroy() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
`;
  fs.writeFileSync(path.join(javaDir, "TournyxVoiceService.java"), voiceServiceSource, "utf8");

  // 3. Patch MainActivity.java (Direct Native Permissions, LocationManager GPS Engine, WebView Mic/Cam Prompt, Screen Share & Voice)
  const mainActPath = path.join(javaDir, "MainActivity.java");
  const javaSource = String.raw`package in.tournyx.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioManager;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int REQ_LOCATION_WEB = 9041;
    private static final int REQ_SCREEN_SHARE = 9042;
    private static final int REQ_ALL_PERMS = 9043;
    private static final int REQ_LOCATION_NATIVE = 9044;
    private static final int REQ_MEDIA_WEB = 9045;
    private static final int OBSIDIAN_BG = Color.parseColor("#050508");

    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.dts.freefiremax",
        "com.dts.freefireth",
        "com.pubg.imobile",
        "com.activision.callofduty.shooter",
        "com.whatsapp",
        "com.whatsapp.w4b"
    ));

    private static final Set<String> TRUSTED_HOSTS = new HashSet<>(Arrays.asList(
        "app.tournyx.in",
        "tournyx.in",
        "www.tournyx.in",
        "localhost"
    ));

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private PermissionRequest pendingWebMediaRequest;
    private long locPermRequestedAtMs = 0L;
    private LocationListener activeLocationListener;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private volatile long lastFrameSentMs = 0L;
    private int captureWidth = 540;
    private int captureHeight = 960;

    private final BroadcastReceiver voiceActionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getStringExtra("action");
            boolean muted = intent.getBooleanExtra("muted", false);
            boolean speaker = intent.getBooleanExtra("speaker", true);
            if ("leave".equals(action)) stopScreenShareInternal();
            JSONObject payload = new JSONObject();
            try {
                payload.put("action", action != null ? action : "");
                payload.put("muted", muted);
                payload.put("speaker", speaker);
            } catch (Exception ignored) {}
            dispatchJsEvent("tournyx:native-voice-action", payload.toString());
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getWindow() != null) {
            getWindow().getDecorView().setBackgroundColor(OBSIDIAN_BG);
            getWindow().setStatusBarColor(OBSIDIAN_BG);
            getWindow().setNavigationBarColor(OBSIDIAN_BG);
        }

        IntentFilter filter = new IntentFilter(TournyxVoiceService.BROADCAST_VOICE_EVENT);
        ContextCompat.registerReceiver(this, voiceActionReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.setBackgroundColor(OBSIDIAN_BG);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
            webView.addJavascriptInterface(new TournyxNativeJsBridge(), "TournyxAndroidBridge");

            WebSettings settings = webView.getSettings();
            settings.setGeolocationEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setMediaPlaybackRequiresUserGesture(false);

            webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    if (!isTrustedOrigin(origin)) {
                        callback.invoke(origin, false, false);
                        return;
                    }
                    if (hasLocationPermission()) {
                        callback.invoke(origin, true, false);
                    } else {
                        pendingGeoCallback = callback;
                        pendingGeoOrigin = origin;
                        locPermRequestedAtMs = System.currentTimeMillis();
                        ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
                            REQ_LOCATION_WEB
                        );
                    }
                }

                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    if (request == null || request.getOrigin() == null || !isTrustedOrigin(request.getOrigin().toString())) {
                        if (request != null) request.deny();
                        return;
                    }
                    mainHandler.post(() -> {
                        List<String> needed = new ArrayList<>();
                        for (String res : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                needed.add(Manifest.permission.RECORD_AUDIO);
                            }
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                needed.add(Manifest.permission.CAMERA);
                            }
                        }
                        if (needed.isEmpty()) {
                            request.grant(request.getResources());
                        } else {
                            if (pendingWebMediaRequest != null) {
                                try { pendingWebMediaRequest.deny(); } catch (Exception ignored) {}
                            }
                            pendingWebMediaRequest = request;
                            ActivityCompat.requestPermissions(MainActivity.this, needed.toArray(new String[0]), REQ_MEDIA_WEB);
                        }
                    });
                }
            });

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

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isDeviceLocationEnabled() {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled();
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return true;
        }
    }

    @SuppressLint("MissingPermission")
    private void fetchNativeLocationNow() {
        if (!hasLocationPermission()) {
            locPermRequestedAtMs = System.currentTimeMillis();
            ActivityCompat.requestPermissions(
                this,
                new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
                REQ_LOCATION_NATIVE
            );
            return;
        }

        if (!isDeviceLocationEnabled()) {
            emitLocationError(2, "Please turn ON your phone Location (GPS) toggle, then tap Enable Location again.", true);
            try {
                startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            } catch (Exception ignored) {}
            return;
        }

        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) {
                emitLocationError(2, "Location service unavailable on this device.", false);
                return;
            }

            // 1. Check fresh cached location (< 5 minutes old) for instant <50ms login
            Location best = getBestLastKnownLocation(lm);
            if (best != null && (System.currentTimeMillis() - best.getTime()) < 5 * 60 * 1000L) {
                emitLocationSuccess(best);
                return;
            }

            // 2. Request live fix from Network + GPS providers with 8s fail-safe fallback
            clearActiveLocationListener(lm);
            final boolean[] resolved = { false };

            activeLocationListener = new LocationListener() {
                @Override
                public void onLocationChanged(@NonNull Location loc) {
                    if (resolved[0]) return;
                    resolved[0] = true;
                    clearActiveLocationListener(lm);
                    emitLocationSuccess(loc);
                }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override public void onProviderEnabled(@NonNull String provider) {}
                @Override public void onProviderDisabled(@NonNull String provider) {}
            };

            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0L, 0f, activeLocationListener, Looper.getMainLooper());
            }
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, activeLocationListener, Looper.getMainLooper());
            }

            mainHandler.postDelayed(() -> {
                if (resolved[0]) return;
                resolved[0] = true;
                clearActiveLocationListener(lm);
                Location fallback = getBestLastKnownLocation(lm);
                if (fallback != null) emitLocationSuccess(fallback);
                else emitLocationError(3, "Could not lock GPS signal indoors. Move near a window and retry.", false);
            }, 8000);
        } catch (Exception e) {
            emitLocationError(2, "Location lookup failed. Please retry.", false);
        }
    }

    @SuppressLint("MissingPermission")
    private Location getBestLastKnownLocation(LocationManager lm) {
        Location best = null;
        try {
            for (String provider : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(provider);
                if (l == null) continue;
                if (best == null || l.getTime() > best.getTime()) best = l;
            }
        } catch (Exception ignored) {}
        return best;
    }

    private void clearActiveLocationListener(LocationManager lm) {
        try {
            if (activeLocationListener != null && lm != null) lm.removeUpdates(activeLocationListener);
        } catch (Exception ignored) {}
        activeLocationListener = null;
    }

    private void emitLocationSuccess(Location loc) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("latitude", loc.getLatitude());
            payload.put("longitude", loc.getLongitude());
            payload.put("accuracy", loc.getAccuracy());
            payload.put("timestamp", loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis());
        } catch (Exception ignored) {}
        dispatchJsEvent("tournyx:native-location", payload.toString());
    }

    private void emitLocationError(int code, String message, boolean needsSettings) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("code", code);
            payload.put("message", message != null ? message : "Location unavailable");
            payload.put("needsSettings", needsSettings);
        } catch (Exception ignored) {}
        dispatchJsEvent("tournyx:native-location-error", payload.toString());
    }

    private void openAppPermissionSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("open_room", false)) {
            JSONObject payload = new JSONObject();
            try { payload.put("action", "open_room"); } catch (Exception ignored) {}
            dispatchJsEvent("tournyx:native-voice-action", payload.toString());
        }
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(voiceActionReceiver); } catch (Exception ignored) {}
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            clearActiveLocationListener(lm);
        } catch (Exception ignored) {}
        stopScreenShareInternal();
        super.onDestroy();
    }

    private class TournyxNativeJsBridge {
        @JavascriptInterface
        public boolean hasLocationAccess() {
            return hasLocationPermission();
        }

        @JavascriptInterface
        public void requestAllAppPermissions() {
            mainHandler.post(() -> {
                List<String> needed = new ArrayList<>();
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
                    needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                }
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.RECORD_AUDIO);
                }
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.CAMERA);
                }
                if (Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(MainActivity.this, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    needed.add("android.permission.POST_NOTIFICATIONS");
                }
                if (needed.isEmpty()) {
                    JSONObject p = new JSONObject();
                    try { p.put("location", true); } catch (Exception ignored) {}
                    dispatchJsEvent("tournyx:permissions-result", p.toString());
                } else {
                    locPermRequestedAtMs = System.currentTimeMillis();
                    ActivityCompat.requestPermissions(MainActivity.this, needed.toArray(new String[0]), REQ_ALL_PERMS);
                }
            });
        }

        @JavascriptInterface
        public void requestLocationAndFetch() {
            mainHandler.post(MainActivity.this::fetchNativeLocationNow);
        }

        @JavascriptInterface
        public void openAppSettings() {
            mainHandler.post(MainActivity.this::openAppPermissionSettings);
        }

        @JavascriptInterface
        public void startVoiceService(String roomName) {
            Intent svc = new Intent(MainActivity.this, TournyxVoiceService.class);
            svc.setAction(TournyxVoiceService.ACTION_START);
            svc.putExtra("roomName", roomName != null ? roomName : "Tournyx Squad Voice");
            ContextCompat.startForegroundService(MainActivity.this, svc);
        }

        @JavascriptInterface
        public void updateVoiceService(String roomName, boolean muted, boolean speaker) {
            Intent svc = new Intent(MainActivity.this, TournyxVoiceService.class);
            svc.setAction(TournyxVoiceService.ACTION_UPDATE);
            svc.putExtra("roomName", roomName != null ? roomName : "Tournyx Squad Voice");
            svc.putExtra("muted", muted);
            svc.putExtra("speaker", speaker);
            startService(svc);
        }

        @JavascriptInterface
        public void stopVoiceService() {
            stopScreenShareInternal();
            Intent svc = new Intent(MainActivity.this, TournyxVoiceService.class);
            svc.setAction(TournyxVoiceService.ACTION_STOP);
            startService(svc);
        }

        @JavascriptInterface
        public void setSpeakerphone(boolean enabled) {
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                    am.setSpeakerphoneOn(enabled);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void requestScreenShare() {
            mainHandler.post(() -> {
                try {
                    MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                    if (mpm == null) {
                        dispatchJsEvent("tournyx:screen-share-denied", "{}");
                        return;
                    }
                    startActivityForResult(mpm.createScreenCaptureIntent(), REQ_SCREEN_SHARE);
                } catch (Exception e) {
                    dispatchJsEvent("tournyx:screen-share-denied", "{}");
                }
            });
        }

        @JavascriptInterface
        public void stopScreenShare() {
            mainHandler.post(MainActivity.this::stopScreenShareInternal);
        }

        @JavascriptInterface
        public void moveToBackground() {
            mainHandler.post(() -> moveTaskToBack(true));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_SCREEN_SHARE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Intent svc = new Intent(this, TournyxVoiceService.class);
                svc.setAction(TournyxVoiceService.ACTION_ENABLE_PROJECTION);
                ContextCompat.startForegroundService(this, svc);
                mainHandler.postDelayed(() -> startMediaProjectionCapture(resultCode, data), 220);
            } else {
                dispatchJsEvent("tournyx:screen-share-denied", "{}");
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void startMediaProjectionCapture(int resultCode, Intent data) {
        try {
            stopScreenShareInternal();
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (mpm == null) { dispatchJsEvent("tournyx:screen-share-denied", "{}"); return; }
            mediaProjection = mpm.getMediaProjection(resultCode, data);
            if (mediaProjection == null) { dispatchJsEvent("tournyx:screen-share-denied", "{}"); return; }

            DisplayMetrics dm = getResources().getDisplayMetrics();
            float scale = Math.min(1.0f, 540.0f / Math.max(1, Math.min(dm.widthPixels, dm.heightPixels)));
            captureWidth = Math.max(360, ((int) (dm.widthPixels * scale)) & ~1);
            captureHeight = Math.max(640, ((int) (dm.heightPixels * scale)) & ~1);
            int density = dm.densityDpi;

            captureThread = new HandlerThread("TournyxScreenCapture");
            captureThread.start();
            captureHandler = new Handler(captureThread.getLooper());

            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() { mainHandler.post(MainActivity.this::stopScreenShareInternal); }
            }, captureHandler);

            imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image == null) return;
                    long now = System.currentTimeMillis();
                    if (now - lastFrameSentMs < 115) return;
                    lastFrameSentMs = now;

                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int pixelStride = planes[0].getPixelStride();
                    int rowStride = planes[0].getRowStride();
                    int rowPadding = rowStride - pixelStride * captureWidth;

                    Bitmap padded = Bitmap.createBitmap(
                        captureWidth + rowPadding / pixelStride, captureHeight, Bitmap.Config.ARGB_8888
                    );
                    padded.copyPixelsFromBuffer(buffer);
                    Bitmap cropped = Bitmap.createBitmap(padded, 0, 0, captureWidth, captureHeight);
                    if (cropped != padded) padded.recycle();

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    cropped.compress(Bitmap.CompressFormat.JPEG, 52, baos);
                    cropped.recycle();

                    String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                    JSONObject framePayload = new JSONObject();
                    framePayload.put("jpg", b64);
                    dispatchJsEvent("tournyx:screen-frame", framePayload.toString());
                } catch (Exception ignored) {
                } finally {
                    if (image != null) image.close();
                }
            }, captureHandler);

            virtualDisplay = mediaProjection.createVirtualDisplay(
                "TournyxScreenShare", captureWidth, captureHeight, density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader.getSurface(), null, captureHandler
            );

            JSONObject readyPayload = new JSONObject();
            readyPayload.put("width", captureWidth);
            readyPayload.put("height", captureHeight);
            dispatchJsEvent("tournyx:screen-share-ready", readyPayload.toString());
        } catch (Exception e) {
            stopScreenShareInternal();
            dispatchJsEvent("tournyx:screen-share-denied", "{}");
        }
    }

    private void stopScreenShareInternal() {
        try { if (virtualDisplay != null) virtualDisplay.release(); } catch (Exception ignored) {}
        virtualDisplay = null;
        try { if (imageReader != null) imageReader.close(); } catch (Exception ignored) {}
        imageReader = null;
        try { if (mediaProjection != null) mediaProjection.stop(); } catch (Exception ignored) {}
        mediaProjection = null;
        try { if (captureThread != null) captureThread.quitSafely(); } catch (Exception ignored) {}
        captureThread = null;
        captureHandler = null;
        try {
            Intent svc = new Intent(this, TournyxVoiceService.class);
            svc.setAction(TournyxVoiceService.ACTION_DISABLE_PROJECTION);
            startService(svc);
        } catch (Exception ignored) {}
    }

    private void dispatchJsEvent(String eventName, String detailJson) {
        mainHandler.post(() -> {
            if (this.bridge == null || this.bridge.getWebView() == null) return;
            String safeEvent = JSONObject.quote(eventName != null ? eventName : "");
            String safeDetail = (detailJson != null && !detailJson.isEmpty()) ? detailJson : "{}";
            String js = "window.dispatchEvent(new CustomEvent(" + safeEvent + ",{detail:" + safeDetail + "}));";
            this.bridge.getWebView().evaluateJavascript(js, null);
        });
    }

    private boolean isTrustedOrigin(String origin) {
        if (origin == null || origin.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(origin);
            String host = uri.getHost();
            return host != null && TRUSTED_HOSTS.contains(host.toLowerCase());
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        if (requestCode == REQ_LOCATION_WEB && pendingGeoCallback != null) {
            boolean granted = hasLocationPermission();
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
            return;
        }

        if (requestCode == REQ_LOCATION_NATIVE) {
            if (hasLocationPermission()) {
                fetchNativeLocationNow();
            } else {
                long elapsed = System.currentTimeMillis() - locPermRequestedAtMs;
                boolean canAskAgain = ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.ACCESS_FINE_LOCATION);
                boolean permanentlyBlocked = !canAskAgain && elapsed < 450;
                emitLocationError(1, permanentlyBlocked
                    ? "Location is blocked in Android Settings. Enable Location permission for Tournyx and return."
                    : "Location permission is required to log in.", permanentlyBlocked);
                if (permanentlyBlocked) openAppPermissionSettings();
            }
            return;
        }

        if (requestCode == REQ_ALL_PERMS) {
            JSONObject p = new JSONObject();
            try {
                p.put("location", hasLocationPermission());
                p.put("mic", ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
            } catch (Exception ignored) {}
            dispatchJsEvent("tournyx:permissions-result", p.toString());
            return;
        }

        if (requestCode == REQ_MEDIA_WEB && pendingWebMediaRequest != null) {
            boolean grantedAny = false;
            for (int r : grantResults) {
                if (r == PackageManager.PERMISSION_GRANTED) { grantedAny = true; break; }
            }
            try {
                if (grantedAny) pendingWebMediaRequest.grant(pendingWebMediaRequest.getResources());
                else pendingWebMediaRequest.deny();
            } catch (Exception ignored) {}
            pendingWebMediaRequest = null;
            return;
        }

        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }
}
`;
  fs.writeFileSync(mainActPath, javaSource, "utf8");
  console.log("✅ Patched MainActivity.java (Direct Native Permissions, LocationManager Engine, Mic/Cam Prompt & Screen Share).");

  // 4. Patch Obsidian #050508 Launch Theme in styles.xml
  const stylesPath = path.join(ROOT, "android", "app", "src", "main", "res", "values", "styles.xml");
  if (fs.existsSync(stylesPath)) {
    let stylesXml = fs.readFileSync(stylesPath, "utf8");
    if (!stylesXml.includes("#050508")) {
      stylesXml = stylesXml.replace(
        /<item name="android:background">@null<\/item>/,
        '<item name="android:windowBackground">#050508</item>\n        <item name="android:background">#050508</item>\n        <item name="android:statusBarColor">#050508</item>\n        <item name="android:navigationBarColor">#050508</item>\n        <item name="android:windowLightStatusBar">false</item>'
      );
      fs.writeFileSync(stylesPath, stylesXml, "utf8");
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
  if (!plist.includes("UIBackgroundModes")) {
    additions.push(`
	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
		<string>voip</string>
	</array>`);
  }
  if (!plist.includes("CFBundleURLTypes")) {
    additions.push(`
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>in.tournyx.app.oauth</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>in.tournyx.app</string>
			</array>
		</dict>
	</array>`);
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
    console.log("✅ Patched iOS Info.plist.");
  }

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
    }
  }
}

if (target === "android") patchAndroid();
else if (target === "ios") patchIOS();
else {
  patchAndroid();
  patchIOS();
}
