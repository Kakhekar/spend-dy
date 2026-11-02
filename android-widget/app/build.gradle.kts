plugins {
    id("com.android.application")
}

val siteUrl = System.getenv("SITE_URL") ?: "https://kakhekar.github.io/spend-dy/"
val escapedSiteUrl = siteUrl.replace("\\", "\\\\").replace("\"", "\\\"")
val versionCodeValue = System.getenv("RUN_NUMBER")?.toIntOrNull() ?: 1
val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")

android {
    namespace = "com.spenddiary.widget"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.spenddiary.widget"
        minSdk = 23
        targetSdk = 35
        versionCode = versionCodeValue
        versionName = "1.0.$versionCodeValue"
        buildConfigField("String", "SITE_URL", "\"$escapedSiteUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("BUBBLEWRAP_KEYSTORE_PASSWORD")
                keyAlias = "android"
                keyPassword = System.getenv("BUBBLEWRAP_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
