Pod::Spec.new do |s|
  s.name           = 'ExpoLottieSplashScreen'
  s.version        = '0.1.0'
  s.summary        = 'Native Lottie splash screen for Expo (Android & iOS)'
  s.description    = 'An Expo module that plays a Lottie animation as the native splash screen before the JS bundle is ready.'
  s.author         = ''
  s.homepage       = 'https://github.com/deepanshucse/expo-lottie-splash-screen'
  s.platforms      = {
    :ios => '14.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Lottie for iOS — the Swift-native Airbnb Lottie library
  s.dependency 'lottie-ios', '~> 4.4'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end

