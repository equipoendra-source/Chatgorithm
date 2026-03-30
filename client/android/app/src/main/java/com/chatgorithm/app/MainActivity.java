package com.chatgorithm.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<String> permissionsList = new ArrayList<>();
            
            // Core permissions
            permissionsList.add(Manifest.permission.RECORD_AUDIO);
            permissionsList.add(Manifest.permission.CAMERA);
            permissionsList.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
            
            // Storage permissions (pre-Android 13)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                permissionsList.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                permissionsList.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            } else {
                // Android 13+ specific media permissions
                permissionsList.add(Manifest.permission.READ_MEDIA_IMAGES);
                permissionsList.add(Manifest.permission.READ_MEDIA_VIDEO);
                permissionsList.add(Manifest.permission.READ_MEDIA_AUDIO);
            }

            String[] permissions = permissionsList.toArray(new String[0]);
            List<String> neededPermissions = new ArrayList<>();
            
            for (String permission : permissions) {
                if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                    neededPermissions.add(permission);
                }
            }

            if (!neededPermissions.isEmpty()) {
                Log.d(TAG, "Requesting permissions: " + neededPermissions.toString());
                requestPermissions(neededPermissions.toArray(new String[0]), 1234);
            } else {
                Log.d(TAG, "All permissions already granted");
            }
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        // Set custom WebChromeClient that extends BridgeWebChromeClient to grant permissions
        // while preserving Capacitor's file selection functionality
        Bridge bridge = this.getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            Log.d(TAG, "Setting CustomWebChromeClient");
            bridge.getWebView().setWebChromeClient(new CustomWebChromeClient(bridge));
        }
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1234) {
            for (int i = 0; i < permissions.length; i++) {
                String permission = permissions[i];
                boolean granted = grantResults[i] == PackageManager.PERMISSION_GRANTED;
                Log.d(TAG, "Permission " + permission + " granted: " + granted);
            }
        }
    }
}


