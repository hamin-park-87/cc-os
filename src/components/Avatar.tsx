import { avatarSVG } from "@/lib/avatar";
import { creatorPhoto } from "@/lib/format";
import type { Creator } from "@/lib/types";

export function Avatar({ creator, name, size = 40, radius }: {
  creator?: Creator; name?: string; size?: number; radius?: number;
}) {
  const nm = creator?.name ?? name ?? "?";
  const r = radius ?? Math.round(size * 0.28);
  // creator 객체의 사진 우선, 없으면 이름으로 전역 등록된 사진 사용
  const photo = creator?.photoUrl ?? (name ? creatorPhoto(name) : undefined);
  return (
    <span className="avimg" style={{ width: size, height: size, borderRadius: r }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={nm} style={{ width: size, height: size, objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{ width: size, height: size, display: "block" }}
          dangerouslySetInnerHTML={{ __html: avatarSVG(nm) }} />
      )}
    </span>
  );
}
