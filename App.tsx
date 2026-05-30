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
} from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Handle physical back button on Android to navigate within the app
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    if (Platform.OS === 'android') {
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
    }

    return () => {
      BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    };
  }, [canGoBack]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Set status bar to match app theme for a seamless look */}
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      <View style={{ flex: 1 }}>
        <WebView
          ref={webViewRef}
          // Load the local bundled HTML for 100% offline standalone usage
          source={require('./assets/index.html')}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loadingText}>FluxList AI</Text>
            </View>
          )}
          originWhitelist={['*']}
          nestedScrollEnabled={true}
          androidLayerType="hardware"
          mixedContentMode="compatibility"
          allowsBackForwardNavigationGestures={true}
          textZoom={100}
          overScrollMode="never"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
