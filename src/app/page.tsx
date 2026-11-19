import InkGallery from "@/components/InkGallery";
import statues from "../../public/models/statues/statues.json";
import torsos from "../../public/models/torsos/torsos.json";

const models = {
  statues: statues.map(({ id, file, height }) => ({ id, file, height })),
  torsos: torsos.map(({ id, file, height, frontYaw }) => ({ id, file, height, frontYaw })),
};

export default function Home() {
  return (
    <main aria-label="Perfect Circle — Ink Gallery">
      <InkGallery models={models} />
    </main>
  );
}
