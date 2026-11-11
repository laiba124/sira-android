import SiraTopBar from "./SiraTopBar";

export default function SiraHeader({
  back,
  showBack,
}: {
  back?: boolean;
  showBack?: boolean;
}) {
  return <SiraTopBar back={Boolean(back || showBack)} />;
}
