import * as THREE from "three";

import type { OfficeFloor } from "~/types/office";

/**
 * The tower is the same building seen from outside, so it lives in the same
 * scene as the floor and is drawn with the same materials. It is built once
 * from the floor directory and the rooms the source already knows about, then
 * updated as presence changes: an office is lit while somebody is in it.
 *
 * Every storey sizes its own grid from what is on it. A floor full of private
 * offices packs twenty per row; a floor with three people stretches those
 * three across the whole facade; the general floor resizes its channel strip
 * as the organisation adds channels. Nothing is left as an empty wall.
 *
 * Only the tower shell, the office cells and their labels are created here.
 * Everything interactive (the lift, the search, flying into a room) belongs to
 * the engine and the overlay around it.
 */

export interface TowerOffice {
  roomId: string;
  floorIndex: number;
  name: string;
  kind: string;
  /** Who the office belongs to. A private office always has one. */
  occupantName?: string;
  /** Whether that person is standing in it right now. */
  present?: boolean;
  status?: "online" | "idle" | "away" | "call" | "dnd";
  tint?: string;
  /** Portrait of the person who owns the office, when the source has one. */
  avatarUrl?: string;
  /** False for decorative offices the demo fills a storey with. */
  interactive?: boolean;
}

const STATUS_COLORS: Record<string, number> = {
  online: 0x34d399,
  idle: 0xf59e0b,
  away: 0x94a3b8,
  call: 0x60a5fa,
  dnd: 0xf43f5e,
};

const FLOOR_HEIGHT = 3.5;
const SLAB = 0.35;
const TOWER_WIDTH = 24;
const TOWER_DEPTH = 10;
const FACADE_Z = TOWER_DEPTH / 2;
const INNER_PAD_X = 0.9;
const INNER_PAD_Y = 0.34;
const CELL_GAP = 0.12;
const LIFT_WIDTH = 1.3;
const LIFT_DEPTH = 2.6;

// Twenty offices is a full storey (the backend caps a floor at 40 people, so
// two rows fill it). Channels are fewer and wider, so they wrap sooner.
const PERSONAL_PER_ROW = 20;
const CHANNEL_PER_ROW = 8;

function floorY(floors: OfficeFloor[], index: number): number {
  // The general floor (index 0) is on top and the tower grows downwards.
  const top = Math.max(...floors.map((floor) => floor.index), 0);
  return (top - index) * (FLOOR_HEIGHT + SLAB);
}

function isTowerRoom(office: TowerOffice): boolean {
  return office.kind === "personal" || office.kind === "channel";
}

function isLit(office: TowerOffice): boolean {
  return Boolean(office.present) || office.kind === "channel";
}

function statusColor(status?: string): number {
  return STATUS_COLORS[status ?? "online"] ?? STATUS_COLORS.online;
}

/** A stable 0..1 value per cell, so the tower does not flicker between frames. */
function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Split a storey's rooms into rows that use the full facade. The last row is
 * allowed to be shorter only when the rooms cannot divide evenly.
 */
function rowCounts(count: number, maxPerRow: number): number[] {
  const rows = Math.max(1, Math.ceil(count / maxPerRow));
  const perRow = Math.ceil(count / rows);
  const counts: number[] = [];
  let remaining = count;
  for (let row = 0; row < rows && remaining > 0; row += 1) {
    const size = Math.min(perRow, remaining);
    counts.push(size);
    remaining -= size;
  }
  return counts;
}

function plateSprite(text: string, color = "#f8fafc"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "600 48px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const clipped = text.length > 24 ? `${text.slice(0, 23)}\u2026` : text;
    ctx.fillText(clipped, 14, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  );
  sprite.scale.set(2.6, 0.34, 1);
  return sprite;
}

/** "Ada Obi" -> "AO", the label used when a source has no portrait. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The occupant's face in the window. A portrait is used when the source has
 * one; otherwise the disc carries their initials in the room's own tint, so an
 * empty office still reads as somebody's office.
 */
function avatarTexture(
  name: string,
  tint: string,
  present: boolean
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.beginPath();
    ctx.arc(48, 48, 44, 0, Math.PI * 2);
    ctx.fillStyle = present ? tint : "#2a3550";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = present
      ? "rgba(255,255,255,0.4)"
      : "rgba(255,255,255,0.14)";
    ctx.stroke();
    ctx.fillStyle = present ? "#0b0d17" : "#96a2c0";
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(name), 48, 50);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const portraitCache = new Map<string, THREE.Texture>();

/** Portraits are shared by every office that shows the same person. */
function portraitTexture(url: string): THREE.Texture {
  const cached = portraitCache.get(url);
  if (cached) return cached;
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  portraitCache.set(url, texture);
  return texture;
}

/** The short storey tag on the left edge: L for the lobby, F1..Fn above it. */
function tagSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "700 54px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  );
  sprite.scale.set(1.1, 1.1, 1);
  return sprite;
}

interface OfficeCell {
  office: TowerOffice;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  rect: CellRect;
  statusDot?: THREE.Mesh;
  plate?: THREE.Sprite;
  avatar?: THREE.Sprite;
}

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  col: number;
}

export class TowerScene {
  readonly group = new THREE.Group();

  private shell = new THREE.Group();
  private cells = new Map<string, OfficeCell>();
  private cellMeshes: THREE.Mesh[] = [];
  private floorSlabs = new Map<number, THREE.Mesh>();
  private floors: OfficeFloor[] = [];
  private structureKey = "";
  private hovered: string | null = null;
  private pulsed: string | null = null;
  private pulsedUntil = 0;
  private tintedFloor: number | null = null;
  private focusedFloor: number | null = null;
  private focusedRoom: string | null = null;
  private liftCar: THREE.Mesh | null = null;
  private liftY = 0;
  private liftTargetY = 0;
  private lastElapsed = 0;
  private beacon: THREE.Mesh | null = null;

  constructor() {
    this.group.name = "office-tower";
    this.group.add(this.shell);
  }

  get height(): number {
    const top = this.floors.length
      ? Math.max(...this.floors.map((floor) => floor.index))
      : 0;
    return (top + 1) * (FLOOR_HEIGHT + SLAB);
  }

  get width(): number {
    return TOWER_WIDTH;
  }

  get depth(): number {
    return TOWER_DEPTH;
  }

  get floorCount(): number {
    return this.floors.length;
  }

  get focusedFloorIndex(): number | null {
    return this.focusedFloor;
  }

  /** Rebuild the tower from the directory and the rooms on every floor. */
  setData(floors: OfficeFloor[], offices: TowerOffice[]) {
    // The general floor is always the top one, so ordering is fixed here.
    const nextFloors = floors.length
      ? [...floors].sort((a, b) => a.index - b.index)
      : [
          {
            index: 0,
            kind: "general" as const,
            name: "General",
            capacity: 0,
            members: 0,
            hasPortal: false,
          },
        ];
    const nextOffices = offices.filter(isTowerRoom);
    const key = `${nextFloors
      .map((floor) => `${floor.index}:${floor.kind}:${floor.members}`)
      .join("|")}#${nextOffices
      .map((office) => `${office.roomId}:${office.floorIndex}:${office.kind}`)
      .join(",")}`;

    // Presence republishes the roster several times a second. Only the people
    // in offices change, so the geometry is rebuilt only when the structure
    // or the lit set changes, not on every status tick.
    if (key === this.structureKey && this.floors.length) {
      this.syncOccupants(nextOffices);
      return;
    }

    this.structureKey = key;
    this.rebuild(nextFloors, nextOffices);
  }

  private rebuild(floors: OfficeFloor[], offices: TowerOffice[]) {
    this.clearShell();
    this.floors = floors;

    for (const floor of floors) {
      this.buildFloor(floor);
    }
    this.buildStructure();

    const byFloor = new Map<number, TowerOffice[]>();
    for (const office of offices) {
      const list = byFloor.get(office.floorIndex);
      if (list) list.push(office);
      else byFloor.set(office.floorIndex, [office]);
    }
    for (const floor of floors) {
      this.buildFloorCells(floor, byFloor.get(floor.index) ?? []);
    }

    if (
      this.focusedFloor !== null &&
      !floors.some((floor) => floor.index === this.focusedFloor)
    ) {
      this.focusedFloor = null;
    }
    this.applyFloorTint();

    const top = Math.max(...floors.map((floor) => floor.index), 0);
    this.liftY = floorY(floors, top) + SLAB + FLOOR_HEIGHT / 2;
    this.liftTargetY = this.liftY;
    if (this.liftCar) this.liftCar.position.y = this.liftY;
  }

  /** Update who is in which office without touching the geometry. */
  private syncOccupants(offices: TowerOffice[]) {
    const byId = new Map(offices.map((office) => [office.roomId, office]));
    let needsRebuild = false;

    for (const [id, cell] of this.cells) {
      const next = byId.get(id);
      if (!next) {
        needsRebuild = true;
        break;
      }
      if (
        isLit(next) !== isLit(cell.office) ||
        next.occupantName !== cell.office.occupantName
      ) {
        needsRebuild = true;
        break;
      }
    }

    if (needsRebuild) {
      this.rebuild(this.floors, offices);
      return;
    }

    for (const [id, cell] of this.cells) {
      const next = byId.get(id);
      if (!next) continue;
      cell.office = next;
      if (cell.statusDot) {
        const material = cell.statusDot.material as THREE.MeshBasicMaterial;
        material.color.setHex(statusColor(next.status));
      }
      if (this.hovered !== id) {
        cell.material.emissiveIntensity = this.baseIntensity(cell);
      }
    }
  }

  // ------------------------------------------------------------------ shell

  private buildFloor(floor: OfficeFloor) {
    const y = floorY(this.floors, floor.index);
    const general = floor.kind === "general";

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_WIDTH, SLAB, TOWER_DEPTH),
      new THREE.MeshStandardMaterial({
        color: general ? 0x2b2447 : 0x141a2c,
        roughness: 0.85,
        metalness: 0.1,
      })
    );
    slab.position.set(0, y + SLAB / 2, 0);
    this.shell.add(slab);
    this.floorSlabs.set(floor.index, slab);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_WIDTH, FLOOR_HEIGHT, 0.4),
      new THREE.MeshStandardMaterial({
        color: general ? 0x1f1b38 : 0x0d1220,
        roughness: 0.95,
      })
    );
    back.position.set(0, y + SLAB + FLOOR_HEIGHT / 2, -TOWER_DEPTH / 2 + 0.2);
    this.shell.add(back);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, FLOOR_HEIGHT, TOWER_DEPTH),
        new THREE.MeshStandardMaterial({
          color: 0x111726,
          roughness: 0.95,
        })
      );
      wall.position.set(
        (side * TOWER_WIDTH) / 2 - side * 0.2,
        y + SLAB + FLOOR_HEIGHT / 2,
        0
      );
      this.shell.add(wall);
    }

    // The general floor sits above the member floors and is tagged L, like the
    // lobby mark in the reference tower; the rest are F1..Fn.
    const tag = tagSprite(
      general ? "L" : `F${floor.index}`,
      general ? "#c4b5fd" : "#7f8cab"
    );
    tag.position.set(-TOWER_WIDTH / 2 - 2.9, y + SLAB + FLOOR_HEIGHT / 2, 0);
    this.shell.add(tag);

    // A dim strip of windows on the camera-facing side, so the tower reads as
    // a building even where the cutaway does not show the interior.
    for (let slot = 0; slot < 5; slot += 1) {
      const lit = noise(floor.index * 17 + slot * 5.3) > 0.55;
      const window = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.1),
        new THREE.MeshStandardMaterial({
          color: lit ? 0x33456b : 0x0c1120,
          emissive: lit ? 0x7f8fc4 : 0x0a0e18,
          emissiveIntensity: lit ? 0.55 : 0.15,
          roughness: 0.7,
        })
      );
      window.rotation.y = Math.PI / 2;
      window.position.set(
        TOWER_WIDTH / 2 + 0.03,
        y + SLAB + FLOOR_HEIGHT / 2,
        -TOWER_DEPTH / 2 + 1.4 + slot * 1.7
      );
      this.shell.add(window);
    }

    if (floor.hasPortal) {
      const portal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 2),
        new THREE.MeshStandardMaterial({
          color: 0x8b5cf6,
          emissive: 0x8b5cf6,
          emissiveIntensity: 0.6,
          side: THREE.DoubleSide,
        })
      );
      portal.position.set(TOWER_WIDTH / 2 - 2, y + SLAB + 1.1, TOWER_DEPTH / 2);
      this.shell.add(portal);
    }
  }

  /** The parts that make the stack read as a tower: base, roof, edges, lift. */
  private buildStructure() {
    const height = this.height;

    // The tower stands in daylight, so it needs a site under it instead of
    // floating in the sky. Only the tower view shows this group.
    const site = new THREE.Mesh(
      new THREE.PlaneGeometry(TOWER_WIDTH * 9, TOWER_WIDTH * 6),
      new THREE.MeshStandardMaterial({
        color: 0xe3ecf5,
        roughness: 1,
        metalness: 0,
      })
    );
    site.rotation.x = -Math.PI / 2;
    site.position.set(0, -1.4, 0);
    this.shell.add(site);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_WIDTH + 2.6, 1.3, TOWER_DEPTH + 2),
      new THREE.MeshStandardMaterial({ color: 0x0b101c, roughness: 0.95 })
    );
    plinth.position.set(0, -0.65, 0);
    this.shell.add(plinth);

    const baseGlow = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_WIDTH + 2.9, 0.08, TOWER_DEPTH + 2.3),
      new THREE.MeshStandardMaterial({
        color: 0x6d5bd0,
        emissive: 0x6d5bd0,
        emissiveIntensity: 0.7,
        roughness: 0.6,
      })
    );
    baseGlow.position.set(0, -1.33, 0);
    this.shell.add(baseGlow);

    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, height, 0.44),
          new THREE.MeshStandardMaterial({
            color: 0x1a2237,
            emissive: 0x233052,
            emissiveIntensity: 0.35,
            roughness: 0.7,
          })
        );
        pillar.position.set(
          (x * TOWER_WIDTH) / 2,
          height / 2,
          (z * TOWER_DEPTH) / 2
        );
        this.shell.add(pillar);
      }
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_WIDTH + 1.4, 0.5, TOWER_DEPTH + 1.1),
      new THREE.MeshStandardMaterial({ color: 0x151c2e, roughness: 0.85 })
    );
    roof.position.set(0, height + 0.25, 0);
    this.shell.add(roof);

    const plant = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_WIDTH * 0.42, 1.5, TOWER_DEPTH * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x101728, roughness: 0.9 })
    );
    plant.position.set(0, height + 1.25, 0);
    this.shell.add(plant);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 3, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.6 })
    );
    mast.position.set(TOWER_WIDTH * 0.24, height + 3.1, 0);
    this.shell.add(mast);

    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    this.beacon.position.set(TOWER_WIDTH * 0.24, height + 4.7, 0);
    this.shell.add(this.beacon);

    // A glass lift core on the camera-facing edge, with a car that rides to
    // whichever storey is in focus (and idles up and down when none is).
    const shaftX = TOWER_WIDTH / 2 + LIFT_WIDTH / 2 + 0.25;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(LIFT_WIDTH, height + 0.6, LIFT_DEPTH),
      new THREE.MeshStandardMaterial({
        color: 0x18233a,
        emissive: 0x3a4c7a,
        emissiveIntensity: 0.35,
        roughness: 0.45,
        metalness: 0.2,
        transparent: true,
        opacity: 0.9,
      })
    );
    shaft.position.set(shaftX, height / 2 - 0.3, FACADE_Z - LIFT_DEPTH / 2);
    this.shell.add(shaft);

    this.liftCar = new THREE.Mesh(
      new THREE.BoxGeometry(LIFT_WIDTH - 0.3, 2.2, LIFT_DEPTH - 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        emissive: 0x8b5cf6,
        emissiveIntensity: 0.85,
        roughness: 0.4,
      })
    );
    this.liftCar.position.set(shaftX, this.liftY, FACADE_Z - LIFT_DEPTH / 2);
    this.shell.add(this.liftCar);
  }

  // ------------------------------------------------------------------ cells

  private buildFloorCells(floor: OfficeFloor, offices: TowerOffice[]) {
    if (!offices.length) return;

    const maxPerRow =
      floor.kind === "general" ? CHANNEL_PER_ROW : PERSONAL_PER_ROW;
    const counts = rowCounts(offices.length, maxPerRow);
    const rows = counts.length;
    const usableW = TOWER_WIDTH - INNER_PAD_X * 2;
    const usableH = FLOOR_HEIGHT - INNER_PAD_Y * 2;
    const rowH = usableH / rows;
    const baseY = floorY(this.floors, floor.index) + SLAB + INNER_PAD_Y;

    let index = 0;
    counts.forEach((count, row) => {
      const cellW = usableW / count;
      for (let col = 0; col < count; col += 1) {
        const office = offices[index];
        index += 1;
        if (!office) continue;
        this.buildOfficeCell(office, {
          x: -usableW / 2 + cellW * (col + 0.5),
          y: baseY + rowH * (row + 0.5),
          w: cellW,
          h: rowH,
          row,
          col,
        });
      }
    });
  }

  private buildOfficeCell(office: TowerOffice, rect: CellRect) {
    const lit = isLit(office);
    const channel = office.kind === "channel";
    const accent = channel && office.tint ? office.tint : null;
    const glow = accent
      ? new THREE.Color(accent)
      : new THREE.Color(channel ? 0x4a6099 : 0x516a9e);

    // Unlit offices are still offices: alternating shades keep a full storey
    // from reading as one flat pane of glass.
    const shade = (rect.row + rect.col) % 2 === 0 ? 0x111a2c : 0x0f1626;
    const warmth =
      0.78 +
      noise(office.floorIndex * 41 + rect.col * 7 + rect.row * 13) * 0.22;
    const material = new THREE.MeshStandardMaterial({
      color: lit ? 0x24324e : shade,
      emissive: lit ? glow : new THREE.Color(0x070a12),
      emissiveIntensity: lit ? (channel ? 0.75 : warmth) : 0.12,
      roughness: 0.7,
      metalness: 0.05,
    });

    const planeW = Math.max(0.2, rect.w - CELL_GAP);
    const planeH = Math.max(0.2, rect.h - CELL_GAP);
    const z = lit ? FACADE_Z - 0.18 : FACADE_Z - 0.04;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(planeW, planeH),
      material
    );
    mesh.position.set(rect.x, rect.y, z);
    mesh.userData.towerRoomId = office.roomId;
    this.shell.add(mesh);
    this.cellMeshes.push(mesh);

    const cell: OfficeCell = { office, mesh, material, rect };

    // Every private office carries its occupant, in or out. An office with
    // nobody in it is still somebody's office.
    if (office.kind === "personal") {
      const label = office.occupantName ?? office.name;
      const present = Boolean(office.present);
      const size = Math.max(0.24, Math.min(planeW * 0.62, planeH * 0.56));
      const disc = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: office.avatarUrl
            ? portraitTexture(office.avatarUrl)
            : avatarTexture(label, office.tint ?? "#c7d2fe", present),
          transparent: true,
          depthWrite: false,
        })
      );
      disc.scale.set(size, size, 1);
      disc.position.set(rect.x, rect.y + planeH * 0.06, z + 0.06);
      this.shell.add(disc);
      cell.avatar = disc;

      const radius = Math.max(
        0.05,
        Math.min(0.12, planeW * 0.08, planeH * 0.1)
      );
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 12),
        new THREE.MeshBasicMaterial({
          color: present
            ? statusColor(office.status)
            : STATUS_COLORS.away /* nobody is at the desk */,
        })
      );
      dot.position.set(
        rect.x + planeW / 2 - radius * 2.4,
        rect.y + planeH / 2 - radius * 2.4,
        z + 0.02
      );
      this.shell.add(dot);
      cell.statusDot = dot;
    }

    if (lit) {
      // A desk silhouette at the back of the room. It is enough to read as an
      // interior at tower distance without a mesh per piece of furniture.
      const desk = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.2, planeW * 0.46), 0.1, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x080c17, roughness: 0.9 })
      );
      desk.position.set(rect.x, rect.y - planeH / 2 + 0.14, FACADE_Z - 0.1);
      this.shell.add(desk);

      // Plates only where the cells are wide enough to read; a full storey of
      // forty offices is a texture, and the hover card carries the names.
      if (planeW >= 2.2) {
        const label = office.occupantName ?? office.name;
        const plate = plateSprite(label);
        plate.scale.set(
          Math.min(planeW - 0.3, 0.6 + label.length * 0.1),
          0.28,
          1
        );
        plate.position.set(rect.x, rect.y - planeH / 2 + 0.24, z + 0.05);
        this.shell.add(plate);
        cell.plate = plate;
      }
    }

    this.cells.set(office.roomId, cell);
  }

  // ------------------------------------------------------------------ state

  /** The office under the pointer, for hover and click. */
  pick(
    ndc: THREE.Vector2,
    camera: THREE.PerspectiveCamera
  ): TowerOffice | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(this.cellMeshes, false);
    const roomId = hits[0]?.object.userData.towerRoomId as string | undefined;
    return roomId ? (this.cells.get(roomId)?.office ?? null) : null;
  }

  setHovered(roomId: string | null) {
    if (this.hovered === roomId) return;
    this.hovered = roomId;
    for (const [id, cell] of this.cells) {
      cell.material.emissiveIntensity =
        id === roomId ? 1.5 : this.baseIntensity(cell);
    }
  }

  private baseIntensity(cell: OfficeCell): number {
    if (!isLit(cell.office)) return 0.12;
    if (cell.office.kind === "channel") return 0.75;
    return 0.9;
  }

  /** Make one office pulse, used when a search picks a person out. */
  pulse(roomId: string) {
    this.pulsed = roomId;
    this.pulsedUntil = performance.now() + 2600;
  }

  /** Tint the storey a search result sits on. */
  tintFloor(index: number | null) {
    this.tintedFloor = index;
    this.applyFloorTint();
  }

  private applyFloorTint() {
    for (const [floorIndex, slab] of this.floorSlabs) {
      const material = slab.material as THREE.MeshStandardMaterial;
      material.color.setHex(
        floorIndex === this.tintedFloor
          ? 0x4c3f8f
          : floorIndex === 0
            ? 0x2b2447
            : 0x141a2c
      );
    }
  }

  /** Frame one storey until it is cleared. */
  focusFloor(index: number | null) {
    this.focusedFloor = index;
    this.focusedRoom = null;
    this.tintFloor(index);
  }

  /**
   * Frame one office. The camera pans to it as well as in, so a click on the
   * far left of a full storey still lands on the office that was clicked.
   */
  focusRoom(roomId: string | null) {
    const cell = roomId ? this.cells.get(roomId) : undefined;
    this.focusFloor(cell ? cell.office.floorIndex : null);
    this.focusedRoom = cell ? (roomId ?? null) : null;
  }

  get focusY(): number {
    if (this.focusedRoom) {
      const cell = this.cells.get(this.focusedRoom);
      if (cell) return cell.rect.y;
    }
    if (this.focusedFloor === null) return this.height / 2;
    return this.storeyCenter(this.focusedFloor);
  }

  /** Where the tower camera should sit horizontally, -1..1 of the facade. */
  get focusX(): number {
    const cell = this.focusedRoom
      ? this.cells.get(this.focusedRoom)
      : undefined;
    return cell ? cell.rect.x : 0;
  }

  /** True when the camera is holding a single office rather than a storey. */
  get roomIsFramed(): boolean {
    return Boolean(this.focusedRoom && this.cells.get(this.focusedRoom));
  }

  private storeyCenter(index: number): number {
    return floorY(this.floors, index) + SLAB + FLOOR_HEIGHT / 2;
  }

  update(elapsed: number) {
    const dt = Math.min(Math.max(elapsed - this.lastElapsed, 0), 0.1);
    this.lastElapsed = elapsed;

    const active = this.pulsed;
    if (active) {
      const cell = this.cells.get(active);
      if (cell && performance.now() < this.pulsedUntil) {
        cell.material.emissiveIntensity = 1.2 + Math.sin(elapsed * 7) * 0.7;
      } else {
        this.pulsed = null;
        if (cell) {
          cell.material.emissiveIntensity = this.baseIntensity(cell);
        }
      }
    }

    if (this.liftCar) {
      const target =
        this.focusedFloor !== null
          ? this.storeyCenter(this.focusedFloor)
          : this.idleLiftY(elapsed);
      this.liftTargetY = target;
      this.liftY += (this.liftTargetY - this.liftY) * Math.min(1, dt * 2.4);
      this.liftCar.position.y = this.liftY;
    }

    if (this.beacon) {
      const pulse = 1 + Math.sin(elapsed * 3.2) * 0.18;
      this.beacon.scale.setScalar(pulse);
    }
  }

  private idleLiftY(elapsed: number): number {
    if (!this.floors.length) return 0;
    const stop = Math.floor(elapsed / 4.5) % this.floors.length;
    return this.storeyCenter(this.floors[stop].index);
  }

  dispose() {
    this.clearShell();
    this.floors = [];
    this.structureKey = "";
    this.focusedFloor = null;
    this.focusedRoom = null;
    this.tintedFloor = null;
    this.liftCar = null;
    this.beacon = null;
    this.lastElapsed = 0;
  }

  private clearShell() {
    // Portraits are cached across rebuilds; the sprites below are dropped but
    // their textures belong to the cache and stay alive.
    for (const cell of this.cells.values()) {
      cell.avatar?.material.map?.dispose();
      cell.avatar?.material.dispose();
      cell.plate?.material.map?.dispose();
      cell.plate?.material.dispose();
    }

    for (const child of [...this.shell.children]) {
      this.shell.remove(child);
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as
          | THREE.Material
          | THREE.Material[]
          | undefined;
        if (Array.isArray(material)) {
          for (const item of material) {
            disposeMaterial(item);
          }
        } else if (material) {
          disposeMaterial(material);
        }
      });
    }
    this.cells.clear();
    this.cellMeshes.length = 0;
    this.floorSlabs.clear();
    this.hovered = null;
    this.pulsed = null;
    this.liftCar = null;
    this.beacon = null;
  }
}

function disposeMaterial(material: THREE.Material) {
  const mapped = material as THREE.MeshStandardMaterial;
  mapped.map?.dispose();
  material.dispose();
}
