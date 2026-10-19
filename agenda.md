# Agenda del Proyecto — Ruleta

## Reglas de trabajo para agentes

### ❌ NO crear worktrees sin orden explícita
- **Prohibido** ejecutar `git worktree add` salvo que el usuario lo pida **por escrito** en la conversación.
- Para comparar versiones: usar `git stash`, `git switch`, o `git show <commit>:ruta/archivo`.
- Si necesitas inspeccionar otro commit, hazlo **en memoria** o con `git show`, no creando carpetas en el Escritorio.

### ✅ Un solo servidor de desarrollo
- Mantener **un único** `npm run dev` (puerto fijo 5177).
- No lanzar `dev:full`, `preview`, ni servidores extra sin confirmar.
- Backend en 3001 (separado, no tocar).

### 🧹 Limpieza obligatoria al terminar
- Si por excepción se crea un worktree (con orden), **borrarlo al finalizar**:
  ```bash
  git worktree remove <ruta> --force
  git worktree prune
  ```
- Verificar: `git worktree list` debe mostrar **solo** `C:/Users/PC/Desktop/ruleta`.

### 📦 Commits y cambios
- No commitear sin revisar con el usuario.
- Working tree limpio antes de cerrar sesión (o stash nombrados).
- Cambios en `ruleta-screen.tsx`, `menu.tsx`, `hero-image.ts` → discutir antes de aplicar.

---

> **Recordatorio:** Este archivo es para agentes (OpenCode, sub-agentes, CI). El usuario **siempre tiene la última palabra**.