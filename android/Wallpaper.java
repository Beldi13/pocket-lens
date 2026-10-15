package dev.beldi.pocketlens;

import android.app.WallpaperManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Looper;
import android.os.ParcelFileDescriptor;

/** Read-only, short-lived ADB shell helper. No APK installation or screenshots. */
public final class Wallpaper {
    public static void main(String[] args) {
        try {
            Looper.prepareMainLooper();
            Class<?> activityThread = Class.forName("android.app.ActivityThread");
            Object thread = activityThread.getMethod("systemMain").invoke(null);
            Context system = (Context) activityThread.getMethod("getSystemContext").invoke(thread);
            Context shell = system.createPackageContext("com.android.shell", 0);
            WallpaperManager manager = WallpaperManager.getInstance(shell);
            // Live wallpapers do not have a static original image to export.
            if (manager.getWallpaperInfo() != null) throw new IllegalStateException();
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (ParcelFileDescriptor file = manager.getWallpaperFile(WallpaperManager.FLAG_SYSTEM)) {
                if (file == null) throw new IllegalStateException();
                BitmapFactory.decodeFileDescriptor(file.getFileDescriptor(), null, bounds);
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IllegalStateException();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1024) {
                options.inSampleSize *= 2;
            }
            try (ParcelFileDescriptor file = manager.getWallpaperFile(WallpaperManager.FLAG_SYSTEM)) {
                if (file == null) throw new IllegalStateException();
                Bitmap bitmap = BitmapFactory.decodeFileDescriptor(file.getFileDescriptor(), null, options);
                if (bitmap == null) throw new IllegalStateException();
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 82, System.out)) {
                    throw new IllegalStateException();
                }
                bitmap.recycle();
                System.out.flush();
            }
            System.exit(0);
        } catch (Throwable unavailable) {
            // Do not log wallpaper paths, contents, identifiers or Android exception details.
            System.err.println("Wallpaper unavailable");
            System.exit(2);
        }
    }
}
