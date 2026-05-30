import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  StatusBar,
  BackHandler,
  Platform,
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  ScrollView
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [targetUrl, setTargetUrl] = useState("http://192.168.5.11:3000");
  const [tempUrlInput, setTempUrlInput] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);

  // Load persisted target URL on mount
  useEffect(() => {
    async function loadSavedUrl() {
      try {
        const OLD_URL = "https://ais-pre-uyz2giptm5vhtl65z7ovv7-524765733839.us-east1.run.app";
        const NEW_URL = "http://192.168.5.11:3000";

        const savedUrl = await AsyncStorage.getItem('@target_url');

        // If it's the old default URL, migrate it to the new one
        if (savedUrl === OLD_URL || !savedUrl) {
          setTargetUrl(NEW_URL);
          setTempUrlInput(NEW_URL);
          await AsyncStorage.setItem('@target_url', NEW_URL);
        } else {
          setTargetUrl(savedUrl);
          setTempUrlInput(savedUrl);
        }
      } catch (err) {
        console.log("Error loading saved URL:", err);
      } finally {
        setIsLoadingUrl(false);
      }
    }
    loadSavedUrl();
  }, []);

  useEffect(() => {
    // Handle physical back button on Android
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Prevent default behavior (exiting app)
      }
      return false; // Exit app
    };

    let subscription: { remove: () => void } | null = null;
    if (Platform.OS === 'android') {
      subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    }

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [canGoBack]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    
    // Auto-detect Google Front End/Cloud Run 404 errors by checking the title of the page loaded in WebView
    if (
      navState.title && 
      (navState.title.toLowerCase().includes("page not found") || 
       navState.title.toLowerCase().includes("error 404") ||
       navState.title.toLowerCase().includes("not found on this server") ||
       navState.title.toLowerCase().includes("requested url was not found"))
    ) {
      setHasError(true);
    }
  };

  const reloadApp = () => {
    setHasError(false);
    setTargetUrl(curr => curr.includes('?') ? curr.split('?')[0] + '?t=' + Date.now() : curr + '?t=' + Date.now());
    webViewRef.current?.reload();
  };

  const handleSaveAndConnect = async () => {
    let sanitized = tempUrlInput.trim();
    if (!sanitized) return;

    // Auto-prepend https if omitted
    if (!/^https?:\/\//i.test(sanitized)) {
      sanitized = 'https://' + sanitized;
    }

    try {
      await AsyncStorage.setItem('@target_url', sanitized);
      setTargetUrl(sanitized);
      setHasError(false);
      setShowConfig(false);
      // Wait a split second to apply state and reload WebView
      setTimeout(() => {
        webViewRef.current?.reload();
      }, 100);
    } catch (err) {
      console.log("Error saving target URL:", err);
    }
  };

  const resetToDefault = async () => {
    const defaultUrl = "http://192.168.5.11:3000?v=" + Date.now();
    try {
      await AsyncStorage.setItem('@target_url', defaultUrl);
      setTargetUrl(defaultUrl);
      setTempUrlInput("http://192.168.5.11:3000");
      setHasError(false);
      setShowConfig(false);
      setTimeout(() => {
        webViewRef.current?.reload();
      }, 100);
    } catch (err) {
      console.log("Error resetting URL:", err);
    }
  };

  if (isLoadingUrl) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      {/* Mini floating bar to trigger/hide settings in the APK */}
      <View style={styles.headerFloatingBar}>
        <TouchableOpacity 
          style={styles.floatingSettingsBtn}
          onPress={() => setShowConfig(!showConfig)}
          activeOpacity={0.8}
        >
          <Text style={styles.floatingSettingsText}>
            {showConfig ? "✕ Close Config" : "⚙️ App Setup"}
          </Text>
        </TouchableOpacity>
        {targetUrl !== "https://fluxlist-ai-746841761180.us-west2.run.app" && (
          <View style={styles.customBadge}>
            <Text style={styles.customBadgeText}>Custom Host Active</Text>
          </View>
        )}
      </View>

      {showConfig ? (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.configOverlay}
        >
          <ScrollView contentContainerStyle={styles.configScroll}>
            <Text style={styles.configHeader}>📡 Target URL Configulator</Text>
            <Text style={styles.configMeta}>
              Google AI Studio rotates webapp domains frequently. Paste your Active Shared App/Preview URL below to point your APK to the proper server instance.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>SHARED APP URL</Text>
              <TextInput
                style={styles.urlInput}
                value={tempUrlInput}
                onChangeText={setTempUrlInput}
                placeholder="https://fluxlist-ai-...run.app"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={handleSaveAndConnect}>
              <Text style={styles.applyBtnText}>Apply & Re-calibrate Connection</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetBtn} onPress={resetToDefault}>
              <Text style={styles.resetBtnText}>Restore Default Session Link</Text>
            </TouchableOpacity>

            <View style={styles.statusBox}>
              <Text style={styles.statusLabel}>CURRENT ACTIVE PATH:</Text>
              <Text style={styles.statusPath} selectable>{targetUrl}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : hasError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorSymbol}>⚠️</Text>
          <Text style={styles.errorHeader}>Page Not Found / Offline</Text>
          <Text style={styles.errorText}>
            Could not load FluxList AI. This occurs if your AI Studio server host URL has rotated or expired.
          </Text>

          <View style={styles.inlineConfigCard}>
            <Text style={styles.inlineCardTitle}>Paste Your Active Shared App URL:</Text>
            <TextInput
              style={styles.inlineUrlInput}
              value={tempUrlInput}
              onChangeText={setTempUrlInput}
              placeholder="https://fluxlist-ai-...run.app"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.inlineSaveBtn} onPress={handleSaveAndConnect}>
              <Text style={styles.inlineSaveBtnText}>Save & Reconnect</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.retryButton} onPress={reloadApp}>
            <Text style={styles.retryButtonText}>🔄 Attempt Reload</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1, position: 'relative' }}>
          <WebView
            ref={webViewRef}
            source={{ uri: targetUrl }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onNavigationStateChange={handleNavigationStateChange}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>Calibrating FluxList AI...</Text>
                <Text style={styles.loadingSubtext}>{targetUrl}</Text>
              </View>
            )}
            onError={() => setHasError(true)}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            userAgent="FluxListAndroidApp/1.0 Webview"
            
            // Critical enhancements for modern Android flagships (e.g. Galaxy S24+ Ultra)
            originWhitelist={['*']}
            nestedScrollEnabled={true}                        // Prevents swipe/scrolling conflict inside React Native layouts
            androidLayerType="hardware"                       // Ensures butter-smooth 120Hz rendering on high-refresh phone displays
            mixedContentMode="compatibility"                  // Loads images and remote resources safely even over mixed assets
            allowsBackForwardNavigationGestures={true}        // Enhances gesture swipe support for modern Android navigation
            textZoom={100}                                    // Critical! Prevents Android's "Display Settings -> Font Size" enlargement from ruining App Layout bounds
            overScrollMode="never"                            // Provides uniform scroll boundaries
            setSupportMultipleWindows={false}                 // Locks workflow into a single robust container
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Matches FluxList deep slate UI background
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerFloatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    zIndex: 100,
  },
  floatingSettingsBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  floatingSettingsText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
  },
  customBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  customBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 15,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingSubtext: {
    color: '#475569',
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
    fontSize: 9,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  errorSymbol: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorHeader: {
    color: '#f87171',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  inlineConfigCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  inlineCardTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  inlineUrlInput: {
    backgroundColor: '#0f172a',
    borderColor: '#475569',
    borderWidth: 1,
    borderRadius: 4,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
    marginBottom: 12,
  },
  inlineSaveBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  inlineSaveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  retryButton: {
    backgroundColor: '#475569',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  configOverlay: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  configScroll: {
    padding: 24,
    paddingTop: 16,
  },
  configHeader: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  configMeta: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#6366f1',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 1,
  },
  urlInput: {
    backgroundColor: '#1e293b',
    borderColor: '#475569',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
  },
  applyBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  applyBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  resetBtn: {
    borderColor: '#334155',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 24,
  },
  resetBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBox: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16,
  },
  statusLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusPath: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
  },
});
