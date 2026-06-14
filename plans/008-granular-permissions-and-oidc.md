# 008 — Permisos granulares (roles + overrides por biblioteca, estilo Discord) + OIDC

**Objetivo.** Rework de autorización para alcanzar la propuesta de Kavita:
"Use OIDC or built-in logins to manage your users. Restrict access based on library. Full
control over who sees what, with granular permission settings."

Capacidades nuevas:

1. **Roles propios** (creados en runtime por el Org Owner) con **permisos globales** sobre un
   **vocabulario granular que cubre contenido Y gestión de org**, gobernados por **tablas y lógica
   nuestras** (no Dynamic AC de better-auth). Un rol custom puede, p.ej., invitar miembros.
2. **Overrides de permisos por biblioteca** (allow/deny a nivel @everyone / rol / usuario) — el modelo
   de "permisos por canal" de Discord. La **visibilidad** es la acción `library:view`.
3. **OIDC vía SSO con auto-aprovisionamiento** y mapeo de claims → org + roles.

**Diferido a fase posterior:** *age restrictions* (requiere fuente de age-rating en metadata — ver §9).

---

## 0. Decisión de arquitectura: qué hace better-auth y qué hacemos nosotros

Se descartó el Dynamic Access Control de better-auth (permisos globales por-org, no saben de
bibliotecas; la capa difícil es nuestra igual) **y** se decidió que **toda** la autorización —contenido
y gestión de org— sea granular y propia. better-auth queda reducido a authn + datos de org + marcar al
owner. Reparto:

| Capa | Quién manda |
|---|---|
| Authn (sesiones, password, **OIDC/SSO**, `account`, linking) | **better-auth** |
| Datos de org: tablas `organization`/`member`/`invitation`, `session.activeOrganizationId`, crear org | **better-auth** |
| Marcar al **owner** de la org (`member.role`, `creatorRole = "owner"`) | **better-auth** (solo marcador) |
| **Autorización de contenido Y de gestión de org** (roles, overrides, invitar/expulsar/transferir) | **Nuestro** (tablas + `can()` + procedimientos oRPC) |

- **No** activamos `dynamicAccessControl`. **Eliminamos el rol estático `admin`** de la config del plugin
  (queda `owner` como marcador del dueño; el resto son `member`).
- **No** usamos los endpoints de gestión de better-auth (`createInvitation`/`updateMemberRole`/
  `removeMember`…): los reemplazan procedimientos oRPC nuestros, gateados por nuestro vocabulario. Así un
  rol custom ("Moderador") puede invitar sin ser owner.
- `member.role` ∈ {`owner`, `member`} = **solo marcador** de propiedad/pertenencia. Toda capacidad real
  (incl. invitar) sale de nuestros roles.

### Estado actual relevante
- better-auth **1.6.18**, plugins `organization`/`admin`/`username`/`apiKey`. Discord como social provider.
- `packages/api/src/index.ts`: `publicProcedure`/`protectedProcedure`/`adminProcedure`/`orgProcedure`/
  `orgAdminProcedure`. Autorización fina hoy = filtrado por `organizationId`.
- **Invitaciones ya son estilo Discord:** existe `invitation_link` (`code`, `maxUses`, `useCount`,
  `expiresAt`, `revokedAt`, `createdBy`) + `invite-links.router.ts` con `create/list/revoke/join`. **No
  se reimplementa**, solo se adapta (§7). `members.tsx` llama a `authClient.organization.*` para
  invitar/cambiar rol → **migra** a nuestros procedimientos. Email (nodemailer) se reutiliza opcionalmente.
- Harness de tests de autorización (commit `c05b7f4`). Lo extendemos.

---

## 1. Modelo de autorización (estilo Discord)

**Multi-org real.** Roles y overrides son **por-org**. La UI opera bajo `activeOrganizationId`.

### Jerarquía y bypass

| Término de negocio | Mecanismo | Alcance |
|---|---|---|
| **App Owner** (dueño del aplicativo) | rol de **sistema** — plugin `admin()`, `user.role === "admin"` | **bypass global** en todas las orgs |
| **Org Owner** (dueño de una organización) | `member.role` incluye `owner` (creatorRole) | **bypass total** dentro de su org (contenido + gestión); transferible. Por encima de toda la jerarquía |
| Rol con **Administrator** (`organization:administrator`) | rol nuestro con ese flag | bypass de **permisos y overrides**, pero **NO** de jerarquía ni del owner |
| Roles privilegiados (p.ej. "Moderador") | roles **nuestros** con acciones de gestión (`member:invite`, …) | lo que el Org Owner les conceda, limitado por su posición |
| Miembros | roles **nuestros** (mínimo el @everyone) | contenido según roles + overrides |

- **Un único Org Owner por org** (better-auth protege contra dejar la org sin owner). El owner es el
  único bypass absoluto; ni "Administrator" puede tocarlo.
- **Transferir propiedad:** procedimiento nuestro, **hard-check de solo-owner actual** (no delegable),
  en transacción: degrada al owner saliente a `member` y promueve al destino a `owner`.

### Jerarquía de roles (posición) — clave para delegar con seguridad

Los roles tienen **`position`** (entero; mayor = más poder). `@everyone` es el más bajo. La "posición más
alta" de un usuario = máx. posición entre sus roles (owner = ∞). Reglas de gestión (owner las bypassa):

- Crear/editar/borrar/reordenar un rol: solo roles con **posición < la tuya**.
- Asignar roles a un miembro: solo roles con **posición < la tuya**.
- Expulsar/gestionar un miembro: solo si su rol más alto está **por debajo del tuyo**.
- Otorgar permisos (en roles u overrides): **solo acciones que tú posees** (no puedes conceder lo que no
  tienes; en particular `organization:administrator` solo lo concede quien lo tiene).

Esto impide la escalada de privilegios: un "Moderador" no puede ascenderse, ni editar un rol superior,
ni invitar con un rol superior al suyo, ni expulsar al owner.

### Dos capas de permisos (= Discord)

1. **Permiso global del rol** (nuestro): cada rol tiene un set de acciones del vocabulario (§2).
   Permiso global del usuario = **unión** de sus roles.
2. **Override por biblioteca** (nuestro): por (biblioteca, sujeto) se **allow**/**deny** acciones,
   sobrescribiendo lo global **solo en esa biblioteca**. Sujetos: `everyone`, `role`, `user`.
   **Default-allow**, tabla esparsa.

### @everyone = rol por defecto de la org

Cada org tiene un rol `isDefault = true` (el "@everyone"): todos lo tienen implícitamente **sin fila** en
`member_role`. Se siembra al crear la org con permisos de contenido sensatos (`library:view`,
`book:read`, `book:download`, `progress`, `like`, `opds:access`, colecciones). **No** incluye acciones de
gestión de org. Roles extra (con o sin gestión) se asignan vía `member_role`.

> **Visibilidad = `library:view`.** Por defecto @everyone da `view` → ven todas (tu **#1**). Restringir X
> = `deny view @everyone` + `allow view` al rol que entra. "Nadie descarga de X" = `deny book:download
> @everyone` en X. "Solo *Premium* descarga de X" = `deny @everyone` + `allow` al rol *Premium*, en X (tu **#2**).

### Resolución `can(user, libraryId, resource, action)` — algoritmo Discord exacto

```
0. App Owner (sistema) u Org Owner → true
1. base = ¿alguno de los roles del usuario (incl. @everyone) concede resource:action?   // global propio
2. if base tiene organization:administrator (cualquier rol) → true   // short-circuit, ignora overrides
3. ov = overrides de la biblioteca relevantes (everyone + sus roles + él)
   base = ov.everyone.deny ? false : base
   base = ov.everyone.allow ? true  : base
   // tier de roles: acumular TODOS los deny y TODOS los allow, deny primero (allow gana en el tier)
   base = ov.roles.anyDeny  ? false : base
   base = ov.roles.anyAllow ? true  : base
   base = ov.user.deny      ? false : base
   base = ov.user.allow     ? true  : base
4. return base
```

`hasGlobal(user, resource, action)` (gestión de org, no ligada a biblioteca) = pasos 0–1 + Administrator.
`accessibleLibraryIds(user)` = libs con `can(... "library","view")`.

> Fidelidad Discord: **Administrator** bypassa overrides (paso 2) pero **no** jerarquía ni owner. En el
> tier de roles, los allow se OR-ean tras los deny → **allow gana** si dos roles del usuario discrepan.

---

## 2. Vocabulario de permisos (`packages/api/src/auth/permissions.catalog.ts`)

Constante TS = fuente de verdad para validación y grids de UI. Cubre **contenido y gestión de org**.

```ts
export const PERMISSIONS = {
  // gestión de organización (antes en roles estáticos de better-auth)
  organization: ["administrator", "update", "transferOwnership", "delete"],
  member:       ["list", "invite", "remove", "assignRoles"],
  invitation:   ["create", "revoke"],
  roles:        ["manage"],        // crear/editar roles y overrides
  settings:     ["read", "update"],
  sso:          ["manage"],
  // contenido
  library:      ["view", "create", "update", "delete", "scan", "managePaths", "manageProviders", "manageAccess"],
  book:         ["read", "download", "editMetadata", "delete", "bulkEdit"],
  cover:        ["edit"],
  collection:   ["create", "update", "delete", "makePublic"],
  progress:     ["read", "write"],
  like:         ["create"],
  apiKey:       ["create", "revoke"],
  opds:         ["access"],
} as const;
export type PermissionMap = { [R in keyof typeof PERMISSIONS]?: (typeof PERMISSIONS)[R][number][] };
```

`organization:transferOwnership` figura en el catálogo pero su **handler exige ser el owner actual**
(no se concede por rol) — ver §1/§5. `library:view` = visibilidad. `library:manageAccess` = overrides.

---

## 3. Schema (`packages/db/src/schema/general.ts`)

```ts
export const role = pgTable("role", {
  id: text("id").primaryKey(),                       // nanoid
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  position: integer("position").default(0).notNull(),          // jerarquía Discord; @everyone = 0
  isDefault: boolean("is_default").default(false).notNull(),   // @everyone de la org
  permissions: jsonb("permissions").$type<PermissionMap>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ columns: [t.organizationId], foreignColumns: [organization.id] }).onDelete("cascade"),
  unique("role_org_name_idx").on(t.organizationId, t.name),
]);

export const memberRole = pgTable("member_role", {
  id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "member_role_id_seq", ... }),
  userId: text("user_id").notNull(),
  roleId: text("role_id").notNull(),
  organizationId: text("organization_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ columns: [t.userId], foreignColumns: [user.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.roleId], foreignColumns: [role.id] }).onDelete("cascade"),
  unique("member_role_unique_idx").on(t.userId, t.roleId),
]);

export const libraryOverwriteSubjectEnum = pgEnum("library_overwrite_subject", ["everyone", "role", "user"]);

export const libraryPermissionOverwrite = pgTable("library_permission_overwrite", {
  id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "lpo_id_seq", ... }),
  libraryId: bigint("library_id", { mode: "number" }).notNull(),
  organizationId: text("organization_id").notNull(),
  subjectType: libraryOverwriteSubjectEnum("subject_type").notNull(),
  subjectId: text("subject_id"),                     // null si everyone; role.id; o userId
  allow: jsonb("allow").$type<PermissionMap>().notNull().default({}),
  deny:  jsonb("deny").$type<PermissionMap>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ columns: [t.libraryId], foreignColumns: [library.id], name: "lpo_library_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId], foreignColumns: [organization.id] }).onDelete("cascade"),
  unique("lpo_unique_idx").on(t.libraryId, t.subjectType, t.subjectId),
  index("lpo_library_idx").on(t.libraryId),
]);
```

- **El owner se sigue marcando en `member.role` de better-auth** (no tabla nueva): `member.role === "owner"`.
- `library.isPublic` queda como flag derivado/UI; no se usa en queries.
- **Siembra:** al crear org y en `firstSeed()` (orgs existentes) crear el rol `isDefault`. Migración +
  commit. Sin overrides iniciales = comportamiento actual.

---

## 4. better-auth config (`packages/auth/src/index.ts`)

- `organization({ creatorRole: "owner", allowUserToCreateOrganization: false, roles: { owner, member }, ... })`
  — **sin `admin`**, sin `dynamicAccessControl`. Roles estáticos reducidos a marcadores; better-auth ya no
  decide autorización de contenido/gestión (lo hacen nuestros procedimientos).
- Mantener `sendInvitationEmail`/SMTP para reutilizar el envío desde **nuestro** flujo de invitación.
- Hook `after` que restaura `activeOrganizationId`: se conserva y se extiende para SSO (§8).

---

## 5. Resolución + middleware (`packages/api/src/auth/`, `packages/api/src/index.ts`)

- `roles.repository.ts`: CRUD `role`; `getDefaultRole(orgId)`; `getMemberRoleIds(userId, orgId)`.
- `access.repository.ts`: `getUserPermissionContext(userId, orgId)` →
  `{ isOrgOwner, roleIds, globalPerms, hasAdministrator, highestPosition, overwrites }`;
  `getAccessibleLibraryIds(...) → number[] | "ALL"`.
- `access.service.ts`: `hasGlobal(pc, resource, action)`, `can(pc, libraryId, resource, action)` (§1),
  y helpers de jerarquía `canManageRole(pc, role)` / `canManageMember(pc, targetTopPosition)` /
  `assertGrantsSubset(pc, perms)` (no conceder lo que no tienes). Memoizado por request.

```ts
export function requirePermission(resource: string, action: string) {
  return orgProcedure.use(o.middleware(async ({ context, next }) => {
    const pc = await getUserPermissionContext(context.session.user.id, context.organizationId);
    if (isAppOwner(context) || pc.isOrgOwner || hasGlobal(pc, resource, action))
      return next({ context: { ...context, pc } });
    throw new ForbiddenError(`Missing permission: ${resource}:${action}`);
  }));
}
```

- **Gestión de org** ahora son procedimientos nuestros gateados por `requirePermission`:
  `member:invite/remove/assignRoles`, `invitation:create/revoke`, `organization:update`,
  `roles:manage`, `settings:update`. Reemplazan llamadas a `authClient.organization.*`.
- **Jerarquía aplicada en handlers** (además del `requirePermission`): `roles:manage` usa
  `canManageRole`/`assertGrantsSubset`; `member:assignRoles`/`invite` solo asignan roles bajo tu
  posición; `member:remove` usa `canManageMember`. Owner las bypassa.
- **`organization:transferOwnership`** y **`organization:delete`**: handler con **hard-check de solo
  owner** (no basta el permiso), en transacción.
- Acciones ligadas a biblioteca → `can(pc, libraryId, …)` en el handler.
- `accessibleLibraryIds` resuelto una vez por request, en contexto.

---

## 6. Enforcement por biblioteca (parte crítica)

- **Lecturas/listados** (books, libraries, colecciones, feed, búsqueda): `libraryId ∈ accessibleLibraryIds`
  (omitido si `"ALL"`). Repos: `inArray(book.libraryId, ids)`; búsqueda ES `terms`/PGroonga `IN (...)`.
- **Acciones puntuales:** `/download/:uuid` → `can(... "book","download")`; cover → `can(... "book","read")`;
  editMetadata/delete/scan → `can(...)` con el `libraryId` del recurso; **OPDS** → `opds:access` + filtro.

---

## 7. API + Frontend (`apps/web`)

**API (routers nuevos/migrados):**
- `getMyAbilities` (`orgProcedure`) → `{ systemRole, isOrgOwner, roles, globalPerms, accessibleLibraryIds, ssoEnabled }`.
- `roles`: `list/create/update/delete`, `assignMemberRoles(userId, roleIds[])` → `requirePermission("roles","manage")`.
- `members`: `list/remove/assignRoles` → `requirePermission("member", …)` + jerarquía; `transferOwnership` (owner-only).
- **Invitaciones (adaptar `invite-links`):** gate `create`/`revoke` con `invitation:create`/`invitation:revoke`
  (hoy es `orgProcedure` plano); cambiar el campo `role` (enum `member`/`admin`) por **`roleIds[]`** de
  nuestros roles, validados por jerarquía (no asignar roles ≥ tu posición). `joinViaLink`: crear el
  `member` (better-auth, role `member`) + asignar los `roleIds` vía `member_role`, respetando `maxUses`/
  `expiresAt`/`revokedAt`. Email opcional de la link vía nodemailer. *(Requiere migración de la columna
  `invitation_link.role` → tabla puente `invitation_link_role`, o `roleIds` jsonb.)*
- `libraryAccess`: `getOverwrites/upsertOverwrite/deleteOverwrite` → `requirePermission("library","manageAccess")`.

**Frontend (regla "No useEffect"):**
- `use-abilities.ts`: `useAbilities()` → `can(resource, action)` + `accessibleLibraryIds`. Sustituye
  checks dispersos (`user.role === "admin"`, lookups de `member.role`) en `settings-modal.tsx`,
  `sections/libraries.tsx`, `sections/members.tsx`, columnas.
- **Pantalla de Roles** (nueva): CRUD con grid recurso × acción (incl. acciones de gestión de org).
  Visible con `roles:manage`. Botón "Transferir propiedad" solo para el owner.
- **`members.tsx`**: migrar invitar/cambiar-rol/expulsar a los nuevos procedimientos; asignación multi-rol.
- **Permisos por biblioteca** (estilo "Channel Permissions"): overrides everyone/roles/usuarios con grid
  allow / heredar / deny por acción.
- Contenido no accesible no se lista.

---

## 8. OIDC vía SSO + aprovisionamiento (`packages/auth`, `packages/env`, `apps/web`)

**`@better-auth/sso`** (authn), provisioning hacia **nuestras** tablas. Config por **env vars**. Multi-org.

- `bun add @better-auth/sso`; `sso(...)` condicional a `OIDC_ENABLED`. PKCE on.
- **Env**: `OIDC_ENABLED`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
  `OIDC_SCOPES` (default `openid email profile`), `OIDC_GROUPS_CLAIM`,
  `OIDC_ROLE_MAP` (grupo IdP → `role.name`), `OIDC_DEFAULT_ORG_ID`, `OIDC_AUTO_PROVISION`.
- **Provisioning:** primer login → `user` + `member` (role `member`) en `OIDC_DEFAULT_ORG_ID`; grupos →
  `member_role` (`role.name`→`role.id`). Sin match → solo @everyone.
- **Sync por login:** reconciliar `member_role` desde claims. Extender el hook `after`.
- **Frontend:** `ssoClient()`; botón SSO si `ssoEnabled`; panel admin read-only.

---

## 9. Tests (extender harness `c05b7f4`)

- **`can()` / `hasGlobal`** (unit puro): precedencia Discord (global × everyone × rol × usuario, deny/allow);
  **allow gana en el tier de roles**; **Administrator** bypassa overrides pero no jerarquía/owner;
  bypass App Owner / Org Owner; `library:view`; @everyone implícito; multi-rol.
- **`getAccessibleLibraryIds`**: ALL para owners; default-allow; deny everyone view; allow rol view.
- **Jerarquía:** no editar/asignar rol ≥ tu posición; no expulsar miembro de rol superior; no conceder
  permisos que no tienes (`assertGrantsSubset`); owner bypassa. Administrator no puede tocar al owner.
- **Gestión de org granular:** un rol con `member:invite` puede invitar; sin él → FORBIDDEN;
  `transferOwnership`/`delete` solo owner.
- **Invitaciones:** `joinViaLink` respeta `maxUses`/`expiresAt`/`revokedAt` y asigna `roleIds`; crear link
  con rol superior a tu posición → FORBIDDEN.
- **Middleware** (`authorization.test.ts`): `requirePermission` → UNAUTHORIZED/BAD_REQUEST/FORBIDDEN/ok; bypass.
- **Repos:** filtrado `inArray(libraryId, …)`. **SSO:** provisioning + sync.
- `bun test packages/api/` verde.

---

## 10. Fases de ejecución

0. **Schema + core** — vocabulario (§2), tablas `role`/`member_role`/`library_permission_overwrite`,
   migración + siembra @everyone (firstSeed). `hasGlobal`/`can()`/`getAccessibleLibraryIds`. Config
   better-auth: quitar `admin`, fijar `creatorRole`. Sin cambios de comportamiento.
1. **Enforcement backend** — `requirePermission` + `can(...)` en contenido; **migrar gestión de org**
   (invitar/expulsar/asignar-roles/transferir) a procedimientos nuestros. Tests.
2. **API + UI** — `getMyAbilities`, `useAbilities()/can()`, pantalla de Roles (con drag-and-drop de
   posición + flag Administrator), multi-rol, transferir propiedad, permisos por biblioteca, **adaptar
   invitaciones (`invite-links`) a `roleIds[]` + jerarquía**; sustituir checks dispersos y llamadas a
   `authClient.organization.*`.
3. **OIDC/SSO** — plugin, env, provisioning + sync, botón login, panel admin.
4. **(Diferido) Age restrictions** — age-rating en metadata, `maxAgeRating` + `includeUnknowns`, filtrado.

---

## 11. Riesgos / notas

- **Filtrado consistente:** mayor riesgo = olvidar un punto de lectura (búsqueda, OPDS, feeds, cover,
  download). Centralizar `PermissionContext` por request y auditar repos que tocan `book`/`library`.
- **Migrar gestión de org sin romper UI:** `members.tsx` deja de usar `authClient.organization.*`;
  verificar invitación por email/aceptación con el nuevo flujo (reutiliza nodemailer + tabla de invitación).
- **Tiempo real total:** roles, asignaciones y overrides en DB, resueltos por-request → inmediato.
  cookieCache solo afecta identidad/rol de sistema (App Owner), mitigable con re-login.
- **Owner único y transferencia:** un solo owner por org; `transferOwnership`/`delete` con hard-check de
  owner (no delegables). Reusar protección de better-auth de "no dejar la org sin owner".
- **Jerarquía (fidelidad Discord):** la escalada de privilegios se evita con `position` + "solo concedes
  lo que tienes". Es la lógica de gestión más delicada — testear (rol superior, auto-ascenso, Administrator
  intentando tocar al owner). `@everyone` siempre posición 0 y no editable en nombre/posición.
- **Administrator ≠ Owner:** Administrator bypassa permisos/overrides pero respeta jerarquía y no puede
  borrar/transferir la org ni gestionar al owner. Solo el owner es bypass absoluto.
- **Default-allow + tablas esparsas** (resuelve #1). **Siembra @everyone** obligatoria (orgs nuevas y existentes).
- **Precedencia de overrides:** orden Discord exacto (deny@everyone → allow@everyone → deny-rol →
  allow-rol → deny-user → allow-user). Tests exhaustivos (§9).
- **SSO opcional** tras `OIDC_ENABLED`; sin él, email/password + Discord intactos.
</content>
