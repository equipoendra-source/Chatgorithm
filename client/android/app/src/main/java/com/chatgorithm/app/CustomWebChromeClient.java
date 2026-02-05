package com.chatgorithm.app;

import android.util.Log;
import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.Bridge;

public class CustomWebChromeClient extends BridgeWebChromeClient {
    
    private static final String TAG = "CustomWebChromeClient";
    private Bridge bridge;

    public CustomWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        Log.d(TAG, "onPermissionRequest called for: " + java.util.Arrays.toString(request.getResources()));
        
        // Grant all requested permissions on the UI thread
        if (bridge != null && bridge.getActivity() != null) {
            bridge.getActivity().runOnUiThread(() -> {
                Log.d(TAG, "Granting permissions on UI thread");
                request.grant(request.getResources());
            });
        } else {
            // Fallback: grant directly
            Log.d(TAG, "Granting permissions directly (no bridge/activity)");
            request.grant(request.getResources());
        }
    }
}
