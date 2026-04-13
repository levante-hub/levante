# PDR: Background Conversations

**Status:** Draft  
**Author:** Saul Gomez  
**Date:** 2026-04-12  
**Priority:** High  

---

## 1. Problem Statement

Actualmente, cuando un usuario abandona una conversacion activa (que esta en proceso de streaming) para navegar a otra conversacion, un menu, o cualquier otra seccion de la app, **el streaming se cancela inmediatamente** y se pierde todo el progreso de la respuesta del modelo. Esto obliga al usuario a permanecer en la conversacion hasta que el modelo termine de responder, creando una experiencia de uso lineal y bloqueante.

Este comportamiento es especialmente frustrante cuando:
- El modelo esta generando una respuesta larga (analisis, codigo, etc.)
- El usuario quiere consultar algo rapido en otra conversacion mientras espera
- El usuario necesita revisar informacion en otra sesion para complementar la actual

## 2. Proposed Solution

Permitir que las conversaciones continuen procesandose en background cuando el usuario navega fuera de ellas. El sistema debe:

1. **Mantener el streaming activo** en el main process aunque el usuario cambie de vista
2. **Mostrar un indicador visual** (spinner/loading) en el sidebar junto a cada conversacion que sigue procesandose en background
3. **Notificar al usuario** cuando una conversacion en background termina de procesarse, mediante una notificacion toast tipo popup (similar a una notificacion de chat) que muestra el titulo de la conversacion y un preview del contenido
4. **Persistir correctamente** todos los mensajes en la base de datos, exactamente igual que si el usuario hubiera permanecido en la conversacion

## 3. User Experience

### 3.1 Flujo principal

1. El usuario esta en una conversacion y el modelo esta respondiendo (streaming activo)
2. El usuario hace click en otra conversacion del sidebar, o navega a Settings/Models/etc.
3. La conversacion anterior **no se cancela**: sigue procesandose en background
4. En el sidebar, junto al titulo de esa conversacion, aparece un **spinner animado** (referencia: imagen 1 - circulo azul girando junto al titulo)
5. El usuario puede interactuar normalmente con la nueva conversacion o seccion
6. Cuando la conversacion en background termina:
   - El spinner del sidebar desaparece
   - Aparece una **notificacion toast** en la esquina superior derecha (referencia: imagen 2) con:
     - Icono de la app
     - Titulo de la conversacion
     - Preview truncado de la respuesta generada ("Habia una vez una ciudad donde nad...")
   - La notificacion es clickeable: al hacer click, navega directamente a esa conversacion
7. Si el usuario vuelve a la conversacion antes de que termine, ve el progreso actual del streaming y puede seguir observandolo en tiempo real

### 3.2 Multiples conversaciones simultaneas

- El usuario puede tener **varias conversaciones procesandose en background** a la vez
- Cada una muestra su propio spinner en el sidebar
- Las notificaciones de finalizacion aparecen independientemente conforme cada una termina
- Si hay multiples notificaciones, se apilan (comportamiento estandar de sonner)

### 3.3 Cancelacion

- El usuario puede cancelar una conversacion en background haciendo click en el spinner del sidebar (o mediante un boton de stop contextual)
- Si el usuario vuelve a una conversacion en background, puede usar el boton de "Stop" normal para cancelarla

### 3.4 Errores en background

- Si una conversacion en background falla, la notificacion lo indica con un estilo de error
- El spinner se reemplaza por un indicador de error en el sidebar
- Al volver a la conversacion, el usuario ve el error y puede reintentar

## 4. Scope

### In Scope

- Desacoplar el ciclo de vida del streaming del ciclo de vida de la vista/pagina activa
- Mantener streams activos en el main process independientemente de la navegacion del renderer
- Indicador visual de conversacion activa en background (spinner en sidebar)
- Notificacion toast al completarse una conversacion en background
- Persistencia completa de mensajes en DB para conversaciones en background
- Soporte para multiples conversaciones simultaneas en background
- Navegacion de vuelta a conversacion en background (reconexion al stream en progreso)
- Cancelacion de conversaciones en background

### Out of Scope

- Ejecucion simultanea de multiples mensajes dentro de la misma conversacion (una conversacion = un stream activo a la vez)
- Notificaciones del sistema operativo (solo notificaciones in-app)
- Limite configurable de conversaciones simultaneas (se implementara un limite razonable fijo)
- Prioridad o throttling de conversaciones simultaneas
- Persistencia de conversaciones en background entre reinicios de la app

## 5. Architectural Considerations

### 5.1 Desacoplamiento del streaming

Actualmente el streaming esta acoplado al ciclo de vida de `ChatPage` y `useChat`. El stream se inicia desde el renderer a traves de `ElectronChatTransport`, y cuando el componente se desmonta (navegacion), el stream se pierde. 

La solucion requiere **mover la gestion del ciclo de vida del stream al main process** o a una capa persistente en el renderer que sobreviva a la navegacion entre paginas.

### 5.2 Estado global de conversaciones activas

Se necesita un **estado global** (accesible desde cualquier pagina/componente) que rastree:
- Que conversaciones tienen streams activos en background
- El estado de cada stream (processing, completed, error)
- Los chunks/mensajes acumulados para cada stream en background
- Metadata para notificaciones (titulo, preview del contenido)

### 5.3 Reconexion al stream

Cuando el usuario vuelve a una conversacion que esta en background, el sistema debe:
- Cargar los mensajes historicos de la DB
- Mostrar los chunks acumulados hasta el momento
- "Reconectar" la UI al stream en progreso para seguir mostrando chunks en tiempo real
- Manejar el caso donde el stream termino mientras el usuario navegaba (mostrar mensaje completo)

### 5.4 Persistencia en DB

La persistencia de mensajes debe funcionar identicamente para conversaciones activas y en background:
- El mensaje del usuario ya se persiste al enviar
- El mensaje del asistente debe persistirse al completar el stream, incluyendo tool calls, reasoning, attachments y token usage
- La persistencia debe ocurrir incluso si el usuario nunca vuelve a la conversacion

### 5.5 Impacto en recursos

Multiples streams simultaneos implican:
- Multiples conexiones HTTP abiertas al proveedor de AI
- Mayor uso de memoria para buffering de chunks
- Mayor carga en la base de datos
- Considerar un limite maximo razonable de streams simultaneos (e.g., 3-5)

## 6. Key Components Affected

| Componente | Impacto |
|---|---|
| `src/main/ipc/chatHandlers.ts` | Gestionar streams que sobreviven a la navegacion |
| `src/main/services/aiService.ts` | Sin cambios directos, ya es un async generator |
| `src/renderer/stores/chatStore.ts` | Nuevo estado para tracking de background streams |
| `src/renderer/pages/ChatPage.tsx` | Desacoplar streaming del ciclo de vida del componente |
| `src/renderer/transports/ElectronChatTransport.ts` | Soporte para reconexion a streams existentes |
| `src/renderer/components/chat/ChatListContent.tsx` | Indicador de spinner para conversaciones activas |
| `src/renderer/components/sidebar/SidebarSections.tsx` | Pasar estado de background streams al sidebar |
| `src/renderer/components/ui/sonner.tsx` | Notificaciones custom para conversaciones completadas |
| `src/preload/api/chat.ts` | Posibles nuevos IPC channels para background stream management |

## 7. Risks & Mitigations

| Riesgo | Mitigacion |
|---|---|
| Memory leaks por streams que no se limpian | Timeouts automaticos, limpieza agresiva en cleanup handlers |
| Consumo excesivo de API con multiples streams | Limite maximo de streams simultaneos |
| Inconsistencia de estado al reconectar a un stream | Buffer de chunks en el main process como source of truth |
| Race conditions al navegar rapidamente entre conversaciones | Estado atomico y transiciones controladas |
| Complejidad del estado global de streams | Disenar el store de background streams de forma aislada y testeable |
| Degradacion de rendimiento con muchos streams | Profiling y limites, chunks batching ya existente |

## 8. Success Metrics

- El usuario puede abandonar una conversacion en streaming y esta continua hasta completarse
- Al volver a la conversacion, el mensaje completo (o en progreso) se muestra correctamente
- Las notificaciones aparecen de forma confiable al completarse una conversacion en background
- La persistencia en DB es identica a la de una conversacion observada directamente
- No hay memory leaks ni degradacion de rendimiento con uso normal (2-3 streams simultaneos)
- La experiencia de una conversacion activa (en primer plano) no se ve afectada

## 9. Open Questions

1. **Limite de streams simultaneos**: Cual es un numero razonable? 3? 5? Deberia ser configurable?
limite de 3, no configurable por el usuario, pero si en el código fuente
2. **Duracion de notificaciones**: Cuanto tiempo permanece visible la notificacion toast? Deberia ser persistente (requiere dismiss manual)?
   lo normal para que le de tiempo a leerla
3. **Indicador en sidebar**: Solo spinner, o tambien algun texto/badge con info adicional?
   solo spinner
4. **Comportamiento al cerrar la app**: Advertir al usuario si hay conversaciones en background procesandose?
   si se cierr la app se debe apagar el stream y acabarse, no debe seguir si la app no está abierta
5. **Tool approvals en background**: Que pasa si una conversacion en background requiere aprobacion de una tool? Se pausa? Se auto-rechaza?
   aparece una pregunta en lugar de spinner en el chat, para que el usuario sepa que tiene que entrar a aprobar
6. **Compaction/Context**: Las conversaciones en background deben respetar el context budget de forma independiente?
   si
