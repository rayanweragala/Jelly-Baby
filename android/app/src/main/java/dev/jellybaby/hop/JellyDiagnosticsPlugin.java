package dev.jellybaby.hop;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JellyDiagnostics")
public class JellyDiagnosticsPlugin extends Plugin {
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        PackageManager packageManager = getContext().getPackageManager();

        try {
            PackageInfo appInfo = packageManager.getPackageInfo(getContext().getPackageName(), 0);
            result.put("appVersion", appInfo.versionName);
            result.put("appBuild", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? appInfo.getLongVersionCode() : appInfo.versionCode);
        } catch (PackageManager.NameNotFoundException e) {
            result.put("appVersion", "unknown");
            result.put("appBuild", "unknown");
        }

        PackageInfo webViewInfo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? WebView.getCurrentWebViewPackage() : null;
        result.put("webViewPackage", webViewInfo != null ? webViewInfo.packageName : "unknown");
        result.put("webViewVersion", webViewInfo != null ? webViewInfo.versionName : "unknown");
        result.put("androidApi", Build.VERSION.SDK_INT);
        result.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);

        call.resolve(result);
    }
}
