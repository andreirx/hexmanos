# Game Feature

Multiplayer game lobby and Phaser-based game client.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Feature exports (LobbyPage, GamePage) |
| `pages/LobbyPage.tsx` | Game lobby - create, join, list games |
| `pages/GamePage.tsx` | Active game view with Phaser canvas |

## Pages

### LobbyPage
- Lists games the current user has created or joined
- Create game dialog (name, map selection, optional password)
- Join game dialog (game ID, join code, optional password)
- Start/Enter/Stop game actions
- Requires authentication

### GamePage
- Loads game state from API
- Renders map and characters using Phaser 3
- Left sidebar: game controls, player list, character control
- Right sidebar: character list with selection
- Take over/Relinquish character control
- Pause/Stop game actions (host only)

## Components

### GameScene (Phaser.Scene)
- Renders terrain tiles from map data
- Renders character sprites with click interaction
- Camera controls (WASD/arrow keys for panning)
- Character highlighting for controlled state
- Updates character positions on state refresh

## API Integration

Uses functions from `@/api/games.ts`:
- `getGame()` - Load game state
- `createGame()` - Create new game
- `joinGame()` - Join existing game
- `startGame()` - Start game (host)
- `pauseGame()` - Pause game (host)
- `stopGame()` - Stop game (host)
- `takeOverCharacter()` - Take control of character
- `relinquishCharacter()` - Release character control

Uses functions from `@/api/assets.ts`:
- `getAssetById()` - Get asset metadata
- `getAssetFile()` - Load map JSON
- `getAssetFileUrl()` - Get URLs for tile/character images
- `getAssetsByType("MAP")` - List available maps

## State Management

- Game data refreshed after mutations
- Phaser scene updated via `updateCharacters()` method
- Player's controlled character tracked locally
- Selected character for take-over UI
