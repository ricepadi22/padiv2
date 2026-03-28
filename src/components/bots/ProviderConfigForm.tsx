import type { ProviderConfigField } from "../../api/bots.ts";

interface Props {
  fields: ProviderConfigField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function ProviderConfigForm({ fields, values, onChange }: Props) {
  function set(key: string, value: string) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          ) : field.type === "select" ? (
            <select
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === "password" ? "password" : "text"}
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
      ))}
    </div>
  );
}
