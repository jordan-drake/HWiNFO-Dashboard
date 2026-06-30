export default function SystemProfile({ profile }) {
  if (!profile || (!profile.cpu && !profile.gpu && !profile.motherboard && profile.drives.length === 0)) {
    return null;
  }

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-3 py-2">
      <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1.5">SYSTEM PROFILE</div>
      <div className="space-y-1 text-[11px]">
        {profile.cpu && (
          <div>
            <div className="text-gray-700 dark:text-gray-200 font-medium">CPU: {profile.cpu}</div>
            {profile.cpuSpec && (
              <div className="text-gray-500 dark:text-gray-400 text-[10px] pl-4">
                TjMax: {profile.cpuSpec.tjMax}&deg;C | TDP: {profile.cpuSpec.tdp}W
              </div>
            )}
            {profile.unknownCpu && (
              <div className="text-yellow-600 dark:text-yellow-500 text-[10px] pl-4">
                Unknown model — using generic thresholds
              </div>
            )}
          </div>
        )}

        {profile.gpu && (
          <div>
            <div className="text-gray-700 dark:text-gray-200 font-medium">GPU: {profile.gpu}</div>
            {profile.gpuSpec && (
              <div className="text-gray-500 dark:text-gray-400 text-[10px] pl-4">
                Max Temp: {profile.gpuSpec.maxTemp}&deg;C | TDP: {profile.gpuSpec.tdp}W
              </div>
            )}
            {profile.unknownGpu && (
              <div className="text-yellow-600 dark:text-yellow-500 text-[10px] pl-4">
                Unknown model — using generic thresholds
              </div>
            )}
          </div>
        )}

        {profile.motherboard && (
          <div className="text-gray-700 dark:text-gray-200 font-medium">Board: {profile.motherboard}</div>
        )}

        {profile.drives.length > 0 && (
          <div>
            <div className="text-gray-500 dark:text-gray-400 text-[10px]">Drives:</div>
            {profile.drives.map((d, i) => (
              <div key={i} className="text-gray-700 dark:text-gray-200 text-[10px] pl-4">
                {d.model}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
