#include <jni.h>

#include "audio_engine.h"

using bardic::AudioEngine;
using bardic::kMaxVoices;

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeStart(JNIEnv *, jobject) {
    return AudioEngine::get().start() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeStop(JNIEnv *, jobject) {
    AudioEngine::get().stop();
}

JNIEXPORT jboolean JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeLoad(JNIEnv *, jobject, jint slot, jint fd, jint loopMode) {
    return AudioEngine::get().load(slot, fd, loopMode) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeUnload(JNIEnv *, jobject, jint slot) {
    AudioEngine::get().unload(slot);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativePlay(JNIEnv *, jobject, jint slot) {
    AudioEngine::get().play(slot);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativePause(JNIEnv *, jobject, jint slot) {
    AudioEngine::get().pause(slot);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeEnd(JNIEnv *, jobject, jint slot, jint fadeMs) {
    AudioEngine::get().end(slot, fadeMs);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeSetVolume(JNIEnv *, jobject, jint slot, jfloat volume) {
    AudioEngine::get().setVolume(slot, volume);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeSetLoop(JNIEnv *, jobject, jint slot, jint loopMode) {
    AudioEngine::get().setLoop(slot, loopMode);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeSetMasterVolume(JNIEnv *, jobject, jfloat volume) {
    AudioEngine::get().setMasterVolume(volume);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeGetStates(JNIEnv *env, jobject, jintArray out) {
    jint buffer[kMaxVoices];
    AudioEngine::get().getStates(reinterpret_cast<int32_t *>(buffer));
    env->SetIntArrayRegion(out, 0, kMaxVoices, buffer);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeGetProgress(JNIEnv *env, jobject, jfloatArray out) {
    jfloat buffer[kMaxVoices];
    AudioEngine::get().getProgress(buffer);
    env->SetFloatArrayRegion(out, 0, kMaxVoices, buffer);
}

JNIEXPORT void JNICALL
Java_com_bardic_app_audio_NativeEngine_nativeGetStats(JNIEnv *env, jobject, jfloatArray out) {
    jfloat buffer[6];
    AudioEngine::get().getStats(buffer);
    env->SetFloatArrayRegion(out, 0, 6, buffer);
}

}  // extern "C"
