# DevStats · Azure DevOps Dashboard

Dashboard web para visualizar estadísticas de desarrollo directamente desde Azure DevOps. Sin backend, sin instalación — solo abre el archivo en tu navegador.

---

## 🚀 Inicio rápido

1. Descarga el archivo `azure-devops-dashboard-v2.html`
2. Ábrelo en **Chrome** o **Edge**
3. Ingresa tu organización y PAT
4. Selecciona el proyecto y carga datos

---

## 🔑 Configuración del Personal Access Token (PAT)

Ve a `https://dev.azure.com/{tu-organización}` → tu avatar → **Personal Access Tokens** → **New Token**

| Configuración | Valor recomendado |
|---|---|
| **Name** | `devstats-dashboard` |
| **Expiration** | 90 días |
| **Scopes** | Custom defined |
| **Code** | Read |
| **Work Items** | Read |

> ⚠️ El token solo se muestra una vez al crearlo. Guárdalo en un gestor de contraseñas.

Las credenciales se guardan en `localStorage` de tu navegador y **nunca salen de tu máquina**. Se usan directamente contra la API REST de Azure DevOps.

---

## 🗂️ Flujo de navegación

```
Ingresa Org + PAT
       ↓
Lista de proyectos (cargada automáticamente)
       ↓
Selecciona un proyecto
       ↓
Dashboard completo
```

---

## 📊 Funcionalidades

### Filtros globales
Disponibles en la barra superior, se aplican a todas las pestañas simultáneamente:
- **Repositorio** — filtra por repo específico o todos
- **Usuario** — filtra por miembro del equipo (o todo el equipo)
- **Tipo de tarea** — Bug, User Story, Task, Feature
- **Rango de fechas** — cualquier período personalizado

---

### 👥 Tab Equipo
Vista general del equipo con cards por cada desarrollador:
- Commits, PRs, Tasks completadas, líneas de código
- Barra de progreso relativa al miembro más activo
- **Clic en un miembro** → filtra todo el dashboard por esa persona
- Gráficas comparativas: commits, PRs, líneas añadidas, tasks completadas

---

### 📝 Tab Commits
- Commits por día (gráfica de barras)
- Líneas añadidas vs eliminadas por repositorio
- Distribución de commits por repo (dona)
- Archivos más modificados en el período
- Historial completo con hash, mensaje, autor, fecha, +add / -del

---

### 🔀 Tab Pull Requests
| Métrica | Descripción |
|---|---|
| Estado | Activos / Completados / Abandonados |
| Aprobados vs rechazados | Basado en votos reales de los revisores |
| Tiempo promedio de aprobación | Desde creación hasta cierre |
| Comentarios recibidos | Total y promedio por PR |
| Tendencia semanal | Evolución de PRs en el tiempo |
| Task vinculada | Work Item asociado al PR |

---

### ✅ Tab Work Items
| Métrica | Descripción |
|---|---|
| Por estado | To Do / In Progress / Resolved / Done |
| Por tipo | Bug vs User Story vs Task vs Feature |
| Completadas por semana | Tendencia de cierre en el tiempo |
| Tiempo promedio para cerrar | Días desde creación hasta cierre |

---

### 🔗 Tab Trazabilidad
La vista más poderosa: cruza **Tarea → Commits → Pull Request** en una sola pantalla.

Detecta vínculos de dos formas:
1. **Work Items vinculados en el PR** — cuando el desarrollador los linkea al crear el PR
2. **Menciones `#ID` en mensajes de commit** — cuando el desarrollador escribe `#1234` en el mensaje

> Si el equipo no siempre linkea sus tareas, igual captura los vínculos que existan.

---

## 🌐 API de Azure DevOps utilizada

| Endpoint | Para qué |
|---|---|
| `/_apis/projects` | Listar proyectos |
| `/_apis/git/repositories` | Listar repositorios |
| `/_apis/git/repositories/{id}/commits` | Obtener commits |
| `/_apis/git/repositories/{id}/pullrequests` | Obtener PRs |
| `/_apis/git/repositories/{id}/pullRequests/{id}/threads` | Comentarios de PR |
| `/_apis/git/repositories/{id}/pullRequests/{id}/workitems` | Tasks vinculadas al PR |
| `/_apis/wit/wiql` | Consultar work items con WIQL |
| `/_apis/wit/workitems` | Detalle de work items |

Todos los endpoints usan **api-version 7.1**.

---

## ⚠️ Limitaciones conocidas

**CORS** — Algunas organizaciones empresariales tienen políticas CORS que bloquean llamadas desde archivos locales (`file://`). Si ves errores de red, tienes dos opciones:

- Usar la extensión [CORS Unblock](https://chrome.google.com/webstore/detail/cors-unblock) en Chrome/Edge
- Servir el archivo desde un servidor local:
  ```bash
  npx serve .
  # o
  python -m http.server 8080
  ```

**Paginación** — El dashboard carga hasta 300 commits y 150 PRs por repositorio. Para proyectos con mucho histórico, usa rangos de fechas más cortos.

**Líneas de código** — Azure DevOps reporta `changeCounts` (Add/Edit/Delete) a nivel de archivo, no líneas exactas. Es una aproximación por archivos modificados.

**Trazabilidad parcial** — Solo detecta vínculos si el equipo linkea work items en los PRs o menciona `#ID` en mensajes de commit.

---

## 🛠️ Tecnologías

- HTML + CSS + JavaScript vanilla — sin dependencias ni build
- [Chart.js 4.4](https://www.chartjs.org/) — gráficas
- [Azure DevOps REST API 7.1](https://learn.microsoft.com/en-us/rest/api/azure/devops/) — datos
- Fuentes: [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) + [Syne](https://fonts.google.com/specimen/Syne)

---

## 📁 Estructura del proyecto

```
.
├── azure-devops-dashboard-v2.html   # Archivo principal (todo en uno)
└── README.md                        # Este archivo
```

---

## 🔮 Posibles mejoras futuras

- [ ] Exportar datos a CSV o Excel
- [ ] Comparar períodos (este mes vs mes anterior)
- [ ] Alertas de PRs sin revisar hace N días
- [ ] Integración con Azure Boards (sprints)
- [ ] Modo oscuro / claro
- [ ] Soporte multi-organización

---

> Hecho con la API REST de Azure DevOps · Sin backend · Datos 100% locales