package dev.jellybaby.hop;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(JellyDiagnosticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
