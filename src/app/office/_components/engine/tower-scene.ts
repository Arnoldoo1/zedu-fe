import * as THREE from "three";

import type { OfficeFloor } from "~/types/office";

/**
 * The tower is the same building seen from outside, so it lives in the same
 * scene as the floor and is drawn with the same materials. It is built once
 * from the floor directory and the rooms the source already knows about, then
 * updated as presence changes: an office is lit while somebody is in it.
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
  occupantName?: string;
  status?: "online" | "idle" | "away" | "call" | "dnd";
  tint?: string;
}

const STATUS_COLORS: Record<string, number> = {
  online: 0x34d399,
  idle: 0xf59e0b,
  away: 0x94a3b8,
  call: 0x60a5fa,
  dnd: 0xf43f5e,
};

const FLOOR_HEIGHT = 3.2;
const SLAB = 0.34;
const TOWER_WIDTH = 30;
const TOWER_DEPTH = 11;
const OFFICE_COLUMNS = 8;
const OFFICE_ROWS = 5;

function floorY(floors: OfficeFloor[], index: number): number {
  // The general floor (index 0) is on top and the tower grows downwards.
  const top = Math.max(...floors.map((floor) => floor.index), 0);
  return (top - index) * (FLOOR_HEIGHT + SLAB);
}

function labelSprite(
  text: string,
  color = "#e2e8f0",
  width = 512
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "600 54px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const clipped = text.length > 22 ? `${text.slice(0, 21)}\u2026` : text;
    ctx.fillText(clipped, 16, canvas.height / 2);
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
  sprite.scale.set(width / 96, 1.34, 1);
  return sprite;
}

interface OfficeCell {
  office: TowerOffice;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  statusDot?: THREE.Mesh;
  plate?: THREE.Sprite;
}

export class TowerScene {
  readonly group = new THREE.Group();

  private shell = new THREE.Group();
  private cells = new Map<string, OfficeCell>();
  private floorCursor = new Map<number, number>();
  private floorSlabs = new Map<number, THREE.Mesh>();
  private floors: OfficeFloor[] = [];
  private hovered: string | null = null;
  private pulsed: string | null = null;
  private pulsedUntil = 0;
  private tintedFloor: number | null = null;
  private focusedFloor: number | null = null;

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

  /** Rebuild the tower from the directory and the rooms on every floor. */
  setData(floors: OfficeFloor[], offices: TowerOffice[]) {
    this.dispose();

    this.floors = floors.length
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

    for (const floor of this.floors) {
      this.buildFloor(floor);
    }

    for (const office of offices) {
      this.buildOfficeCell(office);
    }
  }

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

    const label = labelSprite(
      `${floor.name}${general ? "" : `  \u00b7  ${floor.members}/${floor.capacity}`}`,
      general ? "#c4b5fd" : "#93a4c8"
    );
    label.position.set(-TOWER_WIDTH / 2 - 6.4, y + SLAB + FLOOR_HEIGHT / 2, 0);
    this.shell.add(label);

    if (floor.hasPortal) {
      const portal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 2.2),
        new THREE.MeshStandardMaterial({
          color: 0x8b5cf6,
          emissive: 0x8b5cf6,
          emissiveIntensity: 0.6,
          side: THREE.DoubleSide,
        })
      );
      portal.position.set(
        TOWER_WIDTH / 2 - 2.4,
        y + SLAB + 1.1,
        TOWER_DEPTH / 2
      );
      this.shell.add(portal);
    }
  }

  private buildOfficeCell(office: TowerOffice) {
    const floor = this.floors.find((item) => item.index === office.floorIndex);
    if (!floor) return;

    // Offices and channels are the two things a storey shows: people's
    // offices on the member floors, the channels on the general floor.
    if (office.kind !== "personal" && office.kind !== "channel") return;

    const slot = this.floorCursor.get(office.floorIndex) ?? 0;
    if (slot >= OFFICE_COLUMNS * OFFICE_ROWS) return;
    this.floorCursor.set(office.floorIndex, slot + 1);

    const column = slot % OFFICE_COLUMNS;
    const row = Math.floor(slot / OFFICE_COLUMNS);

    const cellWidth = (TOWER_WIDTH - 2) / OFFICE_COLUMNS;
    const cellHeight = (FLOOR_HEIGHT - 0.5) / OFFICE_ROWS;
    const y = floorY(this.floors, office.floorIndex);

    const channel = office.kind === "channel";
    const lit = Boolean(office.occupantName) || channel;
    const accent = channel && office.tint ? office.tint : null;

    const material = new THREE.MeshStandardMaterial({
      color: lit ? 0x24324f : 0x10131f,
      emissive: accent ? new THREE.Color(accent) : lit ? 0x3b4d7a : 0x0a0c14,
      emissiveIntensity: lit ? (channel ? 0.4 : 0.55) : 0.12,
      roughness: 0.7,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(cellWidth - 0.16, cellHeight - 0.14),
      material
    );
    mesh.position.set(
      -TOWER_WIDTH / 2 + 1 + column * cellWidth + cellWidth / 2,
      y + SLAB + 0.28 + row * cellHeight + cellHeight / 2,
      -TOWER_DEPTH / 2 + 0.42
    );
    mesh.userData.towerRoomId = office.roomId;
    this.shell.add(mesh);

    const cell: OfficeCell = { office, mesh, material };

    if (lit) {
      const plate = labelSprite(office.occupantName ?? office.name, "#f8fafc");
      plate.scale.set(0.72, 0.18, 1);
      plate.position.set(
        mesh.position.x,
        mesh.position.y - cellHeight / 2 + 0.16,
        mesh.position.z + 0.03
      );
      this.shell.add(plate);
      cell.plate = plate;

      if (office.occupantName) {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.13, 16),
          new THREE.MeshBasicMaterial({
            color: STATUS_COLORS[office.status ?? "online"] ?? 0x34d399,
          })
        );
        dot.position.set(
          mesh.position.x + cellWidth / 2 - 0.34,
          mesh.position.y + cellHeight / 2 - 0.3,
          mesh.position.z + 0.02
        );
        this.shell.add(dot);
        cell.statusDot = dot;
      }
    }

    this.cells.set(office.roomId, cell);
  }

  /** The office under the pointer, for hover and click. */
  pick(
    ndc: THREE.Vector2,
    camera: THREE.PerspectiveCamera
  ): TowerOffice | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(
      Array.from(this.cells.values()).map((cell) => cell.mesh),
      false
    );
    const roomId = hits[0]?.object.userData.towerRoomId as string | undefined;
    return roomId ? (this.cells.get(roomId)?.office ?? null) : null;
  }

  setHovered(roomId: string | null) {
    if (this.hovered === roomId) return;
    this.hovered = roomId;
    for (const [id, cell] of this.cells) {
      cell.material.emissiveIntensity =
        id === roomId ? 1.1 : this.baseIntensity(cell);
    }
  }

  private baseIntensity(cell: OfficeCell): number {
    if (cell.office.occupantName) return 0.55;
    return cell.office.kind === "channel" ? 0.4 : 0.12;
  }

  /** Make one office pulse, used when a search picks a person out. */
  pulse(roomId: string) {
    this.pulsed = roomId;
    this.pulsedUntil = performance.now() + 2600;
  }

  /** Tint the storey a search result sits on. */
  tintFloor(index: number | null) {
    this.tintedFloor = index;
    for (const [floorIndex, slab] of this.floorSlabs) {
      const material = slab.material as THREE.MeshStandardMaterial;
      material.color.setHex(
        floorIndex === index ? 0x4c3f8f : floorIndex === 0 ? 0x2b2447 : 0x141a2c
      );
    }
  }

  /** Frame one storey, or the whole tower when null. */
  focusFloor(index: number | null) {
    this.focusedFloor = index;
  }

  get focusY(): number {
    if (this.focusedFloor === null) return this.height / 2;
    return floorY(this.floors, this.focusedFloor) + FLOOR_HEIGHT / 2;
  }

  update(elapsed: number) {
    const active = this.pulsed;
    if (active) {
      const cell = this.cells.get(active);
      if (cell && performance.now() < this.pulsedUntil) {
        cell.material.emissiveIntensity = 0.9 + Math.sin(elapsed * 7) * 0.55;
      } else {
        this.pulsed = null;
        if (cell) {
          cell.material.emissiveIntensity = this.baseIntensity(cell);
        }
      }
    }

    if (this.tintedFloor !== null && performance.now() >= this.pulsedUntil) {
      this.tintFloor(null);
      this.focusedFloor = null;
    }
  }

  dispose() {
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
    this.floorCursor.clear();
    this.floorSlabs.clear();
    this.hovered = null;
    this.pulsed = null;
    this.tintedFloor = null;
  }
}

function disposeMaterial(material: THREE.Material) {
  const mapped = material as THREE.MeshStandardMaterial;
  mapped.map?.dispose();
  material.dispose();
}
