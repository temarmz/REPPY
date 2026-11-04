import SwiftUI

struct ReppyProfileSegments: View {
    @Binding var selection: String
    var body: some View {
        Picker("Раздел профиля", selection: $selection) { Text("Данные").tag("data"); Text("Прогресс").tag("progress") }.pickerStyle(.segmented).frame(minHeight: ReppyMetrics.small)
    }
}
struct ReppyStudentDetails: View {
    var student: Student
    var expanded = false
    var body: some View {
        if expanded {
            ReppyStack {
                ReppyRow {
                    ReppyHeading(text: "Данные и ограничения")
                    Spacer(minLength: 0)
                    ReppyStudentEditButton(student: student)
                }
                ReppyStudentFacts(student: student)
                ReppyStack(compact: true) {
                    ReppyCaption(text: "Противопоказания и особенности")
                    ReppyText(text: student.contraindications?.isEmpty == false ? student.contraindications! : "Не указаны")
                }
            }
        } else {
        HStack(alignment: .top, spacing: ReppyMetrics.space12) {
            VStack(alignment: .leading, spacing: ReppyMetrics.space6) {
                let facts = [student.height_cm.map { "\($0.reppyNumber) см" }, student.weight_kg.map { "\($0.reppyNumber) кг" }, student.gender == "male" ? "Мужской" : student.gender == "female" ? "Женский" : nil, student.phone?.isEmpty == false ? student.phone : nil].compactMap { $0 }
                if !facts.isEmpty { ReppyCaption(text: facts.joined(separator: " · ")) }
                if let text = student.contraindications, !text.isEmpty { ReppyCaption(text: "Ограничения: \(text)") }
            }.frame(maxWidth: .infinity, alignment: .leading)
            ReppyStudentEditButton(student: student)
        }
        }
    }
}
private struct ReppyStudentFacts: View {
    var student: Student
    @Environment(\.dynamicTypeSize) private var size
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: size.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: ReppyMetrics.space16) {
            fact("Рост", student.height_cm.map { "\($0.reppyNumber) см" } ?? "Не указан")
            fact("Вес", student.weight_kg.map { "\($0.reppyNumber) кг" } ?? "Не указан")
            fact("Пол", student.gender == "male" ? "Мужской" : student.gender == "female" ? "Женский" : "Не указан")
            fact("Телефон", student.phone?.isEmpty == false ? student.phone! : "Не указан")
        }
    }
    private func fact(_ label: String, _ value: String) -> some View {
        ReppyStack(compact: true) { ReppyCaption(text: label); ReppyText(text: value) }.accessibilityElement(children: .combine)
    }
}
struct ReppyAvatar: View {
    var name: String
    var highlighted = false
    var body: some View {
        Text(name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased())
            .reppyTypography(.button).frame(width: ReppyMetrics.small, height: ReppyMetrics.small)
            .foregroundStyle(highlighted ? ReppyTheme.selectedText : ReppyTheme.secondary)
            .background(highlighted ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            .accessibilityHidden(true)
    }
}
struct ReppyProfileIdentity: View {
    var name: String
    var role: String
    var student: Student? = nil
    var body: some View {
        ReppyCard {
            ReppyRow {
                ReppyAvatar(name: name, highlighted: true)
                ReppyStack(compact: true) { ReppyHeading(text: name); ReppyCaption(text: role) }
            }
            if let student { ReppyStudentDetails(student: student, expanded: true) }
        }
    }
}
struct ReppyScheduleHeader<Destination: View>: View {
    var date: Date
    var today = false
    var compactDate = false
    var actionLabel = "Назначить тренировку"
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        ReppyRow {
            if today {
                ReppyTitle(text: "СЕГОДНЯ", subtitle: date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ru_RU"))))
            } else if compactDate {
                ReppyHeading(text: date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ru_RU"))))
            } else {
                HStack(spacing: ReppyMetrics.space12) {
                    ReppyNumber(value: date.formatted(.dateTime.day(.twoDigits)))
                    ReppyStack(compact: true) {
                        ReppyHeading(text: date.formatted(.dateTime.month(.wide).locale(Locale(identifier: "ru_RU"))))
                        ReppyCaption(text: date.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "ru_RU"))))
                    }
                }
            }
            Spacer(minLength: 0)
            NavigationLink(destination: destination) { ReppyToolbarIcon(icon: "plus") }.buttonStyle(.plain).accessibilityLabel(actionLabel)
        }
    }
}
struct ReppyScheduleLink<Destination: View>: View {
    var name: String
    var workout: String
    var time: String
    var completed = false
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            ReppyRow {
                Text(time).reppyTypography(.button).monospacedDigit()
                ReppyAvatar(name: name)
                ReppyStack(compact: true) { ReppyHeading(text: name); ReppyCaption(text: workout) }
                if completed { Image(systemName: "checkmark.circle.fill").foregroundStyle(ReppyTheme.lime).accessibilityLabel("Завершена") }
                Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            }.padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain)
    }
}
struct ReppyAgendaLink<Destination: View>: View {
    var title: String
    var subtitle: String
    var completed = false
    var card = true
    var leadingIcon: String? = nil
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: ReppyMetrics.space12) {
                if let leadingIcon { Image(systemName: leadingIcon).font(.system(size: ReppyMetrics.iconSize)).foregroundStyle(ReppyTheme.trendUp).accessibilityHidden(true) }
                if completed { Image(systemName: "checkmark.circle.fill").foregroundStyle(ReppyTheme.lime).accessibilityLabel("Завершена") }
                VStack(alignment: .leading, spacing: ReppyMetrics.space6) {
                    Text(title).reppyTypography(.heading)
                    Text(subtitle).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").accessibilityHidden(true)
            }.foregroundStyle(ReppyTheme.text).padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(card ? ReppyTheme.surface : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain)
    }
}
struct ReppyStudentContext: View {
    var name: String
    var body: some View {
        ReppyRow { ReppyAvatar(name: name); ReppyStack(compact: true) { ReppyCaption(text: "УЧЕНИК"); ReppyHeading(text: name) } }
    }
}
struct ReppyStudentLink<Destination: View>: View {
    var name: String
    var status: String
    var balance: Int
    var hasSubscription: Bool
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            ReppyRow {
                ReppyAvatar(name: name)
                ReppyStack(compact: true) {
                    ReppyHeading(text: name)
                    ReppyCaption(text: status)
                    Text(ReppySubscriptionSummary.balanceLabel(balance, hasEntries: hasSubscription)).reppyTypography(.button)
                        .foregroundStyle(hasSubscription && balance <= 0 ? ReppyTheme.warning : ReppyTheme.secondary)
                }
                Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            }.padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain).accessibilityLabel(name + ", " + status + ", " + ReppySubscriptionSummary.balanceLabel(balance, hasEntries: hasSubscription))
    }
}
