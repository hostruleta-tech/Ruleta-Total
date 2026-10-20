import { ChevronDown, ListChecks } from "lucide-react";
import { SectionHeading } from "./panel-ui";

const STEPS = [
	"El participante abre el enlace de la ruleta en su móvil.",
	"Pulsa «Girar Ruleta»; el servidor sortea el premio según las probabilidades.",
	"La ruleta frena sola y muestra el resultado con un código.",
	"El personal valida el código y entrega el premio.",
];

/**
 * Guía rápida del flujo del participante. Colapsada por defecto para no
 * alargar el panel; usa `<details>` nativo para mantener la accesibilidad.
 */
export function AdminHelp() {
	return (
		<details className="group overflow-hidden rounded-3xl border border-slate-200/90 bg-white text-slate-800 shadow-xl">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
				<SectionHeading
					icon={ListChecks}
					title="Cómo funciona"
					subtitle="Flujo del participante desde el teléfono."
				/>
				<ChevronDown
					className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
					aria-hidden="true"
				/>
			</summary>

			<div className="space-y-2.5 px-5 pb-5 text-sm text-slate-600">
				{STEPS.map((step, index) => (
					<div key={step} className="flex items-start gap-3">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#035157]/10 text-xs font-bold text-[#035157]">
							{index + 1}
						</span>
						<p className="pt-0.5">{step}</p>
					</div>
				))}
			</div>
		</details>
	);
}
