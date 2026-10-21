#!/bin/bash
export GRADLE_OPTS="-Dorg.gradle.daemon=false"
cd android
./gradlew assembleDebug --no-daemon
