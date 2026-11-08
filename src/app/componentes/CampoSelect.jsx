import { useId } from "react";
import { FaChevronDown } from "react-icons/fa6";

// Lista de opções (<select>) com o mesmo visual do Campo
function CampoSelect({ label, erro, children, className = "", ...props }) {
  const id = useId();
  const idErro = `${id}-erro`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block font-medium text-slate-800">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={erro ? "true" : undefined}
          aria-describedby={erro ? idErro : undefined}
          className={`h-12 w-full appearance-none rounded-2xl border bg-white pl-4 pr-10 text-slate-900 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 ${
            erro ? "border-red-500" : "border-slate-300"
          }`}
          {...props}
        >
          {children}
        </select>
        <FaChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
      </div>
      {erro && (
        <p id={idErro} className="mt-2 text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

export default CampoSelect;
