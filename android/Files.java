package dev.beldi.pocketlens;

import android.os.Environment;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.security.MessageDigest;

/** JSON-line metadata + length-delimited file streams. Runs only as authorized ADB shell. */
public final class Files {
    private static final String ROOT = "/sdcard";
    private static File storage;

    private static void reply(JSONObject value) throws Exception {
        System.out.write((value.toString() + "\n").getBytes("UTF-8"));
        System.out.flush();
    }
    private static String line(InputStream input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int c;
        while ((c = input.read()) != -1 && c != 10) {
            if (bytes.size() >= 65536) throw new IOException("request_size");
            bytes.write(c);
        }
        return new String(bytes.toByteArray(), "UTF-8");
    }
    private static boolean link(File file) throws Exception {
        StructStat stat = Os.lstat(file.getPath());
        return (stat.st_mode & OsConstants.S_IFMT) == OsConstants.S_IFLNK;
    }
    private static boolean appPrivate(String value) {
        String normalized = value.replaceAll("/+", "/").toLowerCase(java.util.Locale.ROOT);
        for (String folder : new String[] { ROOT + "/android/data", ROOT + "/android/obb" }) {
            if (normalized.equals(folder) || normalized.startsWith(folder + "/")) return true;
        }
        return false;
    }
    private static File path(String value, boolean mutation) throws Exception {
        if (!(value.equals(ROOT) || value.startsWith(ROOT + "/")) || value.indexOf('\0') >= 0) {
            throw new IOException("file_path");
        }
        if (appPrivate(value)) throw new IOException("file_private");
        File current = storage;
        String relative = value.substring(ROOT.length());
        for (String part : relative.split("/")) {
            if (part.isEmpty()) continue;
            if (part.equals(".") || part.equals("..")) throw new IOException("file_path");
            current = new File(current, part);
            if (current.exists() && link(current)) throw new IOException("file_link");
        }
        String canonical = current.getCanonicalPath();
        if (!(canonical.equals(storage.getPath()) || canonical.startsWith(storage.getPath() + "/"))) {
            throw new IOException("file_path");
        }
        if (mutation && canonical.equals(storage.getPath())) throw new IOException("file_root");
        return current;
    }
    private static JSONObject entry(File file, String displayPath) throws Exception {
        StructStat stat = Os.lstat(file.getPath());
        int type = stat.st_mode & OsConstants.S_IFMT;
        String kind = type == OsConstants.S_IFLNK ? "link" : type == OsConstants.S_IFDIR ? "directory" : type == OsConstants.S_IFREG ? "file" : "other";
        return new JSONObject().put("name", file.getName()).put("path", displayPath)
            .put("kind", kind).put("size", kind.equals("file") ? stat.st_size : 0)
            .put("modified", stat.st_mtime * 1000L);
    }
    private static String hex(byte[] bytes) {
        StringBuilder output = new StringBuilder();
        for (byte b : bytes) output.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return output.toString();
    }
    private static String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[65536];
        try (InputStream in = new FileInputStream(file)) {
            int n;
            while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n);
        }
        return hex(digest.digest());
    }
    public static void main(String[] args) {
        try {
            storage = Environment.getExternalStorageDirectory().getCanonicalFile();
            JSONObject request = new JSONObject(line(System.in));
            String action = request.getString("action");
            String location = request.getString("path");
            boolean mutation = action.equals("mkdir") || action.equals("rename") || action.equals("delete") || action.equals("put");
            File file = path(location, mutation);
            JSONObject result = new JSONObject().put("ok", true);
            if (action.equals("list")) {
                File[] children = file.listFiles();
                if (children == null) throw new IOException("file_permission");
                JSONArray entries = new JSONArray();
                for (File child : children) {
                    String childPath = location.replaceAll("/+$", "") + "/" + child.getName();
                    if (appPrivate(childPath)) continue;
                    if (entries.length() >= 50000) throw new IOException("file_too_many");
                    entries.put(entry(child, childPath));
                }
                result.put("entries", entries);
            } else if (action.equals("stat")) {
                result.put("entry", file.exists() ? entry(file, location) : JSONObject.NULL);
            } else if (action.equals("mkdir")) {
                if (file.exists()) throw new IOException("file_exists");
                if (!file.mkdir()) throw new IOException("file_permission");
            } else if (action.equals("rename")) {
                File target = path(request.getString("target"), true);
                if (target.exists() && !request.optBoolean("replace", false)) throw new IOException("file_exists");
                if (target.exists() && (!file.isFile() || !target.isFile())) throw new IOException("file_exists");
                // POSIX rename replaces a file atomically; never delete the existing file first.
                Os.rename(file.getPath(), target.getPath());
            } else if (action.equals("delete")) {
                // Rust walks directories explicitly; this call deletes only a file or empty directory.
                if (!file.delete()) throw new IOException("file_permission");
            } else if (action.equals("hash")) {
                if (!file.isFile()) throw new IOException("file_type");
                result.put("hash", hash(file)).put("size", file.length());
            } else if (action.equals("put")) {
                long expected = request.getLong("size");
                if (expected < 0 || file.exists() || !file.getName().startsWith(".pocket-lens-")) throw new IOException("file_path");
                if (!file.createNewFile()) throw new IOException("file_exists");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                boolean complete = false;
                try {
                    reply(new JSONObject().put("ok", true));
                    long remaining = expected;
                    byte[] buffer = new byte[65536];
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        while (remaining > 0) {
                            int count = System.in.read(buffer, 0, (int) Math.min(remaining, buffer.length));
                            if (count < 0) throw new IOException("file_incomplete");
                            out.write(buffer, 0, count);
                            digest.update(buffer, 0, count);
                            remaining -= count;
                        }
                        out.getFD().sync();
                    }
                    result.put("hash", hex(digest.digest())).put("size", expected);
                    complete = true;
                } finally {
                    if (!complete) file.delete();
                }
            } else if (action.equals("get")) {
                if (!file.isFile()) throw new IOException("file_type");
                long size = file.length(), modified = file.lastModified();
                reply(new JSONObject().put("ok", true).put("size", size));
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] buffer = new byte[65536];
                long remaining = size;
                try (InputStream in = new FileInputStream(file)) {
                    while (remaining > 0) {
                        int count = in.read(buffer, 0, (int) Math.min(remaining, buffer.length));
                        if (count < 0) throw new IOException("file_changed");
                        System.out.write(buffer, 0, count);
                        digest.update(buffer, 0, count);
                        remaining -= count;
                    }
                }
                if (file.length() != size || file.lastModified() != modified) throw new IOException("file_changed");
                result.put("hash", hex(digest.digest())).put("size", size);
            } else {
                throw new IOException("file_action");
            }
            reply(result);
            System.exit(0);
        } catch (Throwable error) {
            try {
                String code = error instanceof IOException && error.getMessage() != null && error.getMessage().startsWith("file_")
                    ? error.getMessage() : "file_io";
                reply(new JSONObject().put("ok", false).put("code", code));
            } catch (Throwable ignored) { }
            System.exit(2);
        }
    }
}
