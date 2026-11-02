package com.spenddiary.widget;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    static final String WIDGET_PREFS = "spend_widget";
    private static final int FILE_CHOOSER_REQUEST = 2401;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        webView.addJavascriptInterface(new WidgetBridge(), "SpendDiaryWidget");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_LONG).show();
                    return true;
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.SITE_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean handleNavigation(Uri target) {
        Uri appSite = Uri.parse(BuildConfig.SITE_URL);
        if (appSite.getScheme().equals(target.getScheme())
                && appSite.getHost().equals(target.getHost())
                && target.getPath() != null
                && target.getPath().startsWith(appSite.getPath())) {
            return false;
        }
        if ("https".equals(target.getScheme()) || "http".equals(target.getScheme())) {
            startActivity(new Intent(Intent.ACTION_VIEW, target));
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = resultCode == RESULT_OK && data != null && data.getData() != null
                    ? new Uri[]{data.getData()}
                    : null;
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    public final class WidgetBridge {
        @JavascriptInterface
        public void updateTotals(String todayAmount, String monthAmount, String todayLabel, String monthLabel) {
            runOnUiThread(() -> {
                SharedPreferences preferences = getSharedPreferences(WIDGET_PREFS, MODE_PRIVATE);
                preferences.edit()
                        .putString("today_amount", safeText(todayAmount))
                        .putString("month_amount", safeText(monthAmount))
                        .putString("today_label", safeText(todayLabel))
                        .putString("month_label", safeText(monthLabel))
                        .apply();
                SpendWidgetProvider.updateAll(MainActivity.this);
            });
        }

        private String safeText(String value) {
            return value == null ? "" : value.substring(0, Math.min(value.length(), 40));
        }
    }
}
