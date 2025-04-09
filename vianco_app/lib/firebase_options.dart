// File manually updated with new Firebase project: cerceta-85680
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Firebase no está configurado para Web.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        throw UnsupportedError('Firebase aún no está configurado para iOS.');
      case TargetPlatform.macOS:
        throw UnsupportedError('Firebase aún no está configurado para macOS.');
      case TargetPlatform.windows:
        throw UnsupportedError('Firebase aún no está configurado para Windows.');
      case TargetPlatform.linux:
        throw UnsupportedError('Firebase aún no está configurado para Linux.');
      default:
        throw UnsupportedError('Plataforma no soportada.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDAEBaZifbc4L_PhIg42r4CTOSRO5wWzkk',
    appId: '1:369682544975:android:2ee77ae34d3374eaad2d3a',
    messagingSenderId: '369682544975',
    projectId: 'cerceta-85680',
    storageBucket: 'cerceta-85680.firebasestorage.app',
  );
}
