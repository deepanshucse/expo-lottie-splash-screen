// @ts-check
'use strict';

/**
 * app.plugin.js — Expo Config Plugin for expo-lottie-splash-screen
 *
 * Automates all native file modifications during `expo prebuild`:
 *   Android: copies Lottie JSON to res/raw, patches themes.xml + MainActivity.kt
 *   iOS:     copies Lottie JSON to app bundle, patches AppDelegate.swift
 */

const { createRunOncePlugin } = require('@expo/config-plugins');
const { withAndroidLottieSplash } = require('./plugin/build/withAndroid');
const { withIosLottieSplash } = require('./plugin/build/withIOS');

/**
 * @typedef {Object} PluginOptions
 * @property {string}  animationFile        - Path to the Lottie JSON file (relative to project root). Required.
 * @property {string}  [backgroundColor]    - Splash background color in hex. Default: '#ffffff'.
 * @property {string}  [darkBackgroundColor]- Dark-mode background color in hex. Optional.
 * @property {boolean} [autoHide]           - Hide automatically when animation ends. Default: false.
 */

/**
 * @type {import('@expo/config-plugins').ConfigPlugin<PluginOptions>}
 */
const withLottieSplashScreen = (config, options = {}) => {
  if (!options.animationFile) {
    throw new Error(
      '[expo-lottie-splash-screen] `animationFile` is required in plugin options.\n' +
      'Example:\n' +
      '  ["expo-lottie-splash-screen", { "animationFile": "./assets/splash.json" }]'
    );
  }

  config = withAndroidLottieSplash(config, options);
  config = withIosLottieSplash(config, options);
  return config;
};

module.exports = createRunOncePlugin(
  withLottieSplashScreen,
  'expo-lottie-splash-screen',
  '0.1.0'
);
