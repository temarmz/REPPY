import SwiftUI

private let reppyMuscles = ["Грудь", "Спина", "Плечи", "Бицепс", "Трицепс", "Квадрицепс", "Ягодицы", "Задняя поверхность бедра", "Икры", "Кор"]
struct ExercisePickerScreen: View {
    @EnvironmentObject private var store: AppStore
    var onChoose: (ExerciseDefinition) -> Void
    @State private var search = ""
    @State private var muscle = "Все"
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Добавить упражнение")
            ReppySearch(text: $search)
            ReppyPicker(title: "Мышечная группа", selection: $muscle) { Text("Все").tag("Все"); ForEach(reppyMuscles, id: \.self) { Text($0).tag($0) } }
            if store.isTrainer { ReppyLink(title: "Создать своё упражнение", icon: "plus") { DefinitionFormScreen(onSaved: onChoose) } }
            let definitions = store.data.definitions.filter { definition in
                (search.isEmpty || definition.name.localizedCaseInsensitiveContains(search)) && (muscle == "Все" || definition.muscle_groups.contains(muscle) || definition.primary_muscle == muscle)
            }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            if definitions.isEmpty { ReppyEmpty(title: "Ничего не найдено", message: "Измени поиск или выбери другую мышечную группу.") }
            ForEach(definitions) { definition in
                ReppyButton(title: "\(definition.name) · \(definition.equipment)", disabled: store.busy) { onChoose(definition) }
            }
        }
    }
}
struct ExerciseLibraryScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var search = ""
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Библиотека упражнений")
            ReppySearch(text: $search)
            ReppyLink(title: "Создать упражнение", icon: "plus") { DefinitionFormScreen() }
            ForEach(store.data.definitions.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }.sorted { $0.name < $1.name }) { definition in
                ReppyCard {
                    ReppyHeading(text: definition.name)
                    ReppyCaption(text: "\(definition.equipment) · \(definition.muscle_groups.joined(separator: ", "))")
                    if definition.owner_id == store.profile?.id { ReppyLink(title: "Изменить", icon: "pencil") { DefinitionFormScreen(original: definition) } }
                }
            }
        }
    }
}
private struct DefinitionDraft: Codable {
    var id: String; var name: String; var equipment: String; var groups: Set<String>; var loadMode: LoadMode; var measureType: MeasureType
}
struct DefinitionFormScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var original: ExerciseDefinition? = nil
    var onSaved: ((ExerciseDefinition) -> Void)? = nil
    @State private var id = UUID().uuidString.lowercased()
    @State private var name = ""
    @State private var equipment = ""
    @State private var groups: Set<String> = []
    @State private var loadMode = LoadMode.external
    @State private var measureType = MeasureType.reps
    @State private var initialized = false
    private var draftKey: String { "definition:\(original?.id ?? "new")" }
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: original == nil ? "Своё упражнение" : "Изменить упражнение")
            ReppyCard {
                ReppyField(title: "Название", text: $name)
                ReppyField(title: "Оборудование", text: $equipment)
                ReppyPicker(title: "Нагрузка", selection: $loadMode) { Text("Внешний вес").tag(LoadMode.external); Text("Свой вес").tag(LoadMode.bodyweight) }
                ReppyPicker(title: "Измерение", selection: $measureType) { Text("Повторы").tag(MeasureType.reps); Text("Длительность").tag(MeasureType.duration) }
                ReppyHeading(text: "Мышечные группы")
                ForEach(reppyMuscles, id: \.self) { muscle in
                    ReppyToggle(title: muscle, value: Binding(get: { groups.contains(muscle) }, set: { if $0 { groups.insert(muscle) } else { groups.remove(muscle) } }))
                }
            }
            ReppyButton(title: "Сохранить упражнение", kind: .primary, disabled: store.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
                let ordered = reppyMuscles.filter { groups.contains($0) }
                let definition = ExerciseDefinition(id: original?.id ?? id, slug: nil, owner_id: store.profile?.id, name: name,
                    primary_muscle: ordered.first ?? "Другое", muscle_groups: ordered, equipment: equipment.isEmpty ? "Другое" : equipment,
                    measure_type: measureType, load_mode: loadMode, archived_at: nil)
                Task { if await store.run({
                    try await store.saveDefinition(definition, isNew: original == nil)
                    try DraftStorage.remove(account: store.accountKey, key: draftKey)
                }) { onSaved?(definition); dismiss() } }
            }
        }.onAppear {
            guard !initialized else { return }; initialized = true
            if let draft: DefinitionDraft = store.restoreDraft(key: draftKey) {
                id = draft.id; name = draft.name; equipment = draft.equipment; groups = draft.groups; loadMode = draft.loadMode; measureType = draft.measureType; return
            }
            if let original { name = original.name; equipment = original.equipment; groups = Set(original.muscle_groups); loadMode = original.load_mode; measureType = original.measure_type }
        }.onChange(of: [name, equipment, loadMode.rawValue, measureType.rawValue]) { _, _ in saveDraft() }.onChange(of: groups) { _, _ in saveDraft() }
    }
    private func saveDraft() {
        guard initialized else { return }
        do { try DraftStorage.save(DefinitionDraft(id: id, name: name, equipment: equipment, groups: groups, loadMode: loadMode, measureType: measureType), account: store.accountKey, key: draftKey) } catch { store.present(error) }
    }
}
