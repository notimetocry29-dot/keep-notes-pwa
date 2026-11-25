package app.keeplite.twa;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** غلاف مفكرة: بيفتح نفس صفحة GitHub Pages مع ربط أصلي لحفظ ملف .txt تلقائياً وبصمت والنسخ والرجوع. */
public class MainActivity extends ComponentActivity {
    static final String HOST = "notimetocry29-dot.github.io";
    static final String PATH = "/keep-notes-pwa";
    static final String URL = "https://" + HOST + PATH + "/";
    static final int DARK = Color.parseColor("#0e0e0f"), LIGHT = Color.parseColor("#f3eee5");
    static final int MAX_FILE = 20 * 1024 * 1024;

    private WebView web;
    private FrameLayout root;
    private SharedPreferences prefs;
    private volatile boolean trusted = false;
    private boolean pageDone = false, onAppPage = false;
    private boolean dark = true;
    private boolean offlineShown = false;
    private long lastAuto = 0;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback netCb;

    private String pendingName, pendingMime;
    private byte[] pendingData;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<Intent> saveLauncher, openLauncher, linkLauncher;
    private ValueCallback<Uri[]> fileCallback;

    @Override protected void onCreate(Bundle b) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(b);
        final long t0 = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(() -> !pageDone && SystemClock.uptimeMillis() - t0 < 1000);

        prefs = getSharedPreferences("kl", MODE_PRIVATE);
        dark = prefs.getBoolean("dark", true);
        WebView.setWebContentsDebuggingEnabled(false);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyBars();

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, in) -> {
            Insets bars = in.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = in.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        saveLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            boolean ok = false;
            Uri u = r.getData() == null ? null : r.getData().getData();
            if (r.getResultCode() == RESULT_OK && u != null && pendingData != null) ok = writeUri(u, pendingData);
            boolean cancelled = r.getResultCode() != RESULT_OK;
            pendingData = null;
            if (!cancelled) js("window.__glSaved&&__glSaved(" + ok + ")");
        });

        openLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
            Uri u = r.getResultCode() == RESULT_OK && r.getData() != null ? r.getData().getData() : null;
            if (u == null) return;
            String t = readUri(u);
            js("window.__glOpen&&__glOpen(" + (t == null ? "null" : org.json.JSONObject.quote(t)) + ")");
        });

        linkLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            Uri u = r.getData() == null || r.getResultCode() != RESULT_OK ? null : r.getData().getData();
            if (u == null) { pendingData = null; return; }
            boolean ok = false;
            try {
                getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                ok = pendingData == null || writeUri(u, pendingData);
                if (ok) prefs.edit().putString("link", u.toString()).putString("linkName", pendingName == null ? "keep-notes-backup.txt" : pendingName).apply();
            } catch (Exception ignored) {}
            pendingData = null;
            js("window.__glLinked&&__glLinked(" + ok + "," + org.json.JSONObject.quote(ok ? prefs.getString("linkName", "") : "") + ")");
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING))
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
        else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK))
            WebSettingsCompat.setForceDark(s, WebSettingsCompat.FORCE_DARK_OFF);

        web.setBackgroundColor(dark ? DARK : LIGHT);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Android");

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("keeplite".equals(u.getScheme())) { retry(); return true; }
                if (isAppUrl(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) {}
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                trusted = false; onAppPage = false;
                recreate();
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap f) { trusted = url != null && isAppUrl(Uri.parse(url)); if (trusted) offlineShown = false; }
            @Override public void onPageFinished(WebView v, String url) { pageDone = true; onAppPage = trusted; }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                trusted = false; onAppPage = false; pageDone = true;
                showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) { return true; }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/plain");
                try { openLauncher.launch(i); } catch (Exception e) { fileCallback = null; cb.onReceiveValue(null); return false; }
                return true;
            }
            @Override public boolean onJsConfirm(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                        .setMessage(msg).setCancelable(true)
                        .setPositiveButton(android.R.string.ok, (d, w) -> r.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel()).show();
                return true;
            }
            @Override public boolean onJsAlert(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                        .setMessage(msg).setPositiveButton(android.R.string.ok, (d, w) -> r.confirm())
                        .setOnCancelListener(d -> r.confirm()).show();
                return true;
            }
        });

        web.setDownloadListener((url, ua, cd, mime, len) -> {
            if (!trusted || url == null || !url.startsWith("blob:")) return;
            String name = android.webkit.URLUtil.guessFileName(url, cd, mime);
            js("fetch(" + org.json.JSONObject.quote(url) + ").then(r=>r.blob()).then(b=>new Promise((ok,no)=>{const f=new FileReader();f.onload=()=>ok([b.type,f.result]);f.onerror=no;f.readAsDataURL(b)}))"
                    + ".then(([t,d])=>{if(!Android.saveBase64(" + org.json.JSONObject.quote(name) + ",t||" + org.json.JSONObject.quote(mime == null ? "" : mime) + ",d))window.__glSaved&&__glSaved(false)})"
                    + ".catch(()=>window.__glSaved&&__glSaved(false))");
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (!onAppPage) { finish(); return; }
                web.evaluateJavascript("(function(){try{return !!(window.glBack&&glBack())}catch(e){return false}})()",
                        v -> { if (!"true".equals(v)) finish(); });
            }
        });

        watchNetwork();
        web.loadUrl(URL);
    }

    private void showOffline() {
        String h = readAsset("offline.html")
                .replace("{{TH}}", dark ? "night" : "morning")
                .replace("{{F_R4}}", fontUri("readex-400")).replace("{{F_R6}}", fontUri("readex-600"))
                .replace("{{F_RQ}}", fontUri("ruqaa")).replace("{{F_FT}}", fontUri("figtree"));
        offlineShown = true;
        web.loadDataWithBaseURL(null, h, "text/html", "utf-8", null);
    }

    private String fontUri(String n) {
        try (InputStream in = getAssets().open("fonts/" + n + ".woff2")) {
            ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int k;
            while ((k = in.read(buf)) > 0) o.write(buf, 0, k);
            return "data:font/woff2;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) { return "about:blank"; }
    }

    private boolean hasNet() {
        try {
            NetworkCapabilities c = cm == null ? null : cm.getNetworkCapabilities(cm.getActiveNetwork());
            return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) { return true; }
    }

    private void retry() {
        if (!hasNet()) { js("window.glNet&&glNet('none')"); return; }
        js("window.glNet&&glNet('try')");
        web.loadUrl(URL);
    }

    private void watchNetwork() {
        try {
            cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            netCb = new ConnectivityManager.NetworkCallback() {
                @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) {
                    if (!c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) || !c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return;
                    runOnUiThread(() -> {
                        long now = SystemClock.uptimeMillis();
                        if (!offlineShown || web == null || now - lastAuto < 8000) return;
                        lastAuto = now;
                        retry();
                    });
                }
            };
            cm.registerDefaultNetworkCallback(netCb);
        } catch (Exception ignored) { netCb = null; }
    }

    static boolean isAppUrl(Uri u) {
        String p = u.getPath() == null ? "" : u.getPath();
        return "https".equals(u.getScheme()) && HOST.equals(u.getHost()) && (p.equals(PATH) || p.startsWith(PATH + "/"));
    }

    private boolean writeUri(Uri u, byte[] data) {
        for (String mode : new String[]{"rwt", "wt", "w"}) {
            try {
                ParcelFileDescriptor pfd = getContentResolver().openFileDescriptor(u, mode);
                if (pfd == null) continue;
                try (FileOutputStream o = new ParcelFileDescriptor.AutoCloseOutputStream(pfd)) {
                    o.write(data); o.flush();
                    try { o.getChannel().truncate(data.length); } catch (Exception ignored) {}
                    try { o.getFD().sync(); } catch (Exception ignored) {}
                }
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private boolean writeUri(Uri u, String content) { return writeUri(u, content.getBytes(StandardCharsets.UTF_8)); }

    static String safeName(String name, String def) {
        String s = (name == null ? def : name).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return s.isEmpty() || s.length() > 100 || s.startsWith(".") ? def : s;
    }

    static String safeMime(String mime) {
        String m = mime == null ? "" : mime.toLowerCase(java.util.Locale.ROOT);
        int semi = m.indexOf(';'); if (semi >= 0) m = m.substring(0, semi).trim();
        switch (m) {
            case "text/plain": case "text/markdown": case "text/csv": case "application/json":
            case "image/png": case "image/jpeg": case "image/webp": case "application/pdf":
                return m;
            default: return "application/octet-stream";
        }
    }

    private void launchSave(String name, String mime, byte[] data) {
        pendingName = name; pendingMime = mime; pendingData = data;
        runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
            try { saveLauncher.launch(i); } catch (Exception e) { pendingData = null; js("window.__glSaved&&__glSaved(false)"); }
        });
    }

    private String readUri(Uri u) {
        try (InputStream in = getContentResolver().openInputStream(u)) {
            if (in == null) return null;
            ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int k;
            while ((k = in.read(buf)) > 0) { o.write(buf, 0, k); if (o.size() > MAX_FILE) return null; }
            return o.toString("UTF-8");
        } catch (Exception e) { return null; }
    }

    private String readAsset(String n) {
        try (InputStream in = getAssets().open(n)) {
            ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int k;
            while ((k = in.read(buf)) > 0) o.write(buf, 0, k);
            return o.toString("UTF-8");
        } catch (Exception e) { return "<body style='background:#0e0e0f;color:#ece8e1;font-family:sans-serif;text-align:center;padding-top:40vh' dir='rtl'>أول فتحة محتاجة نت</body>"; }
    }

    private void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    private void applyBars() {
        int c = dark ? DARK : LIGHT;
        root.setBackgroundColor(c);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(c));
        getWindow().setStatusBarColor(c);
        getWindow().setNavigationBarColor(c);
        WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(getWindow(), root);
        ic.setAppearanceLightStatusBars(!dark);
        ic.setAppearanceLightNavigationBars(!dark);
        if (web != null) web.setBackgroundColor(c);
    }

    class Bridge {
        @JavascriptInterface public void saveFile(String name, String mime, String content) {
            if (!trusted || content == null || content.length() > MAX_FILE) return;
            String m = "text/markdown".equals(mime) || "text/csv".equals(mime) || "application/json".equals(mime) ? mime : "text/plain";
            launchSave(safeName(name, "keep-notes-backup.txt"), m, content.getBytes(StandardCharsets.UTF_8));
        }

        @JavascriptInterface public boolean saveBase64(String name, String mime, String b64) {
            if (!trusted || b64 == null || b64.length() > MAX_FILE / 3 * 4 + 1024) return false;
            String m = mime, s = b64;
            if (s.startsWith("data:")) {
                int comma = s.indexOf(',');
                if (comma < 0 || !s.substring(0, comma).endsWith(";base64")) return false;
                if (m == null || m.isEmpty()) m = s.substring(5, comma - 7);
                s = s.substring(comma + 1);
            }
            byte[] data;
            try { data = Base64.decode(s, Base64.DEFAULT); } catch (IllegalArgumentException e) { return false; }
            if (data.length == 0 || data.length > MAX_FILE) return false;
            launchSave(safeName(name, "keep-notes-backup.bin"), safeMime(m), data);
            return true;
        }

        @JavascriptInterface public void linkFile(String name, String content) {
            if (!trusted || content == null || content.length() > MAX_FILE) return;
            String safe = safeName(name, "keep-notes-backup.txt");
            pendingName = safe; pendingData = content.getBytes(StandardCharsets.UTF_8);
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/plain").putExtra(Intent.EXTRA_TITLE, safe)
                        .addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try { linkLauncher.launch(i); } catch (Exception e) { pendingData = null; js("window.__glLinked&&__glLinked(false,'')"); }
            });
        }

        @JavascriptInterface public boolean writeLinked(String content) {
            if (!trusted || content == null || content.length() > MAX_FILE) return false;
            String l = prefs.getString("link", null);
            return l != null && writeUri(Uri.parse(l), content);
        }

        @JavascriptInterface public boolean writeLinkedAsync(String content) {
            if (!trusted || content == null || content.length() > MAX_FILE) return false;
            String l = prefs.getString("link", null);
            if (l == null) return false;
            final Uri u = Uri.parse(l);
            final byte[] data = content.getBytes(StandardCharsets.UTF_8);
            try {
                io.execute(() -> {
                    boolean ok = false;
                    try { ok = writeUri(u, data); } catch (Exception ignored) {}
                    js("window.__glWrote&&__glWrote(" + ok + ")");
                });
            } catch (Exception e) { return false; }
            return true;
        }

        @JavascriptInterface public String linkedName() {
            if (!trusted || prefs.getString("link", null) == null) return "";
            return prefs.getString("linkName", "");
        }

        @JavascriptInterface public boolean copyText(String t) {
            if (!trusted || t == null || t.length() > 1000000) return false;
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("keeplite", t));
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface public void keepAwake(boolean on) {
            if (!trusted) return;
            runOnUiThread(() -> { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
        }

        @JavascriptInterface public void setBarsTheme(boolean isDark) {
            if (!trusted) return;
            runOnUiThread(() -> { dark = isDark; prefs.edit().putBoolean("dark", isDark).apply(); applyBars(); });
        }

        @JavascriptInterface public void exitApp() { if (trusted) runOnUiThread(MainActivity.this::finish); }
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() {
        io.shutdown();
        try { if (cm != null && netCb != null) cm.unregisterNetworkCallback(netCb); } catch (Exception ignored) {}
        if (web != null) { root.removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
