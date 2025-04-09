// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
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

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: "AIzaSyCUakGrJzMJpkrYqfK9udtgxp8ktxLa9sA",
    authDomain: "cerceta-85680.firebaseapp.com",
    projectId: "cerceta-85680",
    storageBucket: "cerceta-85680.firebasestorage.app",
    messagingSenderId: "369682544975",
    appId: "1:369682544975:web:009fdce15f4f5566ad2d3a",
    measurementId: "G-406CKGSY45",
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDAEBaZifbc4L_PhIg42r4CTOSRO5wWzkk',
    appId: '1:369682544975:android:2ee77ae34d3374eaad2d3a',
    messagingSenderId: '369682544975',
    projectId: 'cerceta-85680',
    storageBucket: 'cerceta-85680.firebasestorage.app',
  );
}
