#!/usr/bin/env python3
"""Patche MainActivity.java pour le mode immersif plein ecran (cache la barre de statut Android).
Appele par les workflows GitHub Actions apres `npx cap add android`.
Usage: python3 scripts/patch-immersive.py
"""
import glob
import sys

candidates = glob.glob("android/app/src/main/java/**/MainActivity.java", recursive=True)
if not candidates:
    print("ERREUR: MainActivity.java introuvable", file=sys.stderr)
    sys.exit(1)

path = candidates[0]
src = open(path).read()

if "SYSTEM_UI_FLAG_IMMERSIVE_STICKY" in src:
    print("MainActivity deja patche:", path)
    sys.exit(0)

src = src.replace(
    "import com.getcapacitor.BridgeActivity;",
    "import com.getcapacitor.BridgeActivity;\n"
    "import android.os.Bundle;\n"
    "import android.view.View;",
)

body = """
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    private void hideSystemUI() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }
"""

marker = "public class MainActivity extends BridgeActivity {"
if marker not in src:
    print("ERREUR: signature de classe introuvable dans", path, file=sys.stderr)
    sys.exit(1)

src = src.replace(marker, marker + body, 1)
open(path, "w").write(src)
print("MainActivity patche (mode immersif):", path)
