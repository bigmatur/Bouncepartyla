import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  MobileDriverRouteDateSummary,
} from "../features/routes/driverRoutes";

type Props = {
  visible: boolean;
  selectedDate: string;
  today: string;
  days: MobileDriverRouteDateSummary[];
  onSelectDate: (
    date: string,
  ) => void;
  onClose: () => void;
};

function dateObject(
  value: string,
) {
  return new Date(
    `${value}T12:00:00`,
  );
}

function formatLongDate(
  value: string,
) {
  const date =
    dateObject(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    },
  ).format(date);
}

function formatMonthTitle(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "long",
      year: "numeric",
    },
  ).format(date);
}

function localISO(
  date: Date,
) {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthStart(
  date: Date,
) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
    12,
  );
}

function shiftMonth(
  date: Date,
  amount: number,
) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + amount,
    1,
    12,
  );
}

function buildMonthDays(
  monthDate: Date,
) {
  const year =
    monthDate.getFullYear();

  const month =
    monthDate.getMonth();

  const first =
    new Date(
      year,
      month,
      1,
      12,
    );

  const last =
    new Date(
      year,
      month + 1,
      0,
      12,
    );

  const leading =
    first.getDay();

  const cells: Array<
    string | null
  > = [];

  for (
    let index = 0;
    index < leading;
    index += 1
  ) {
    cells.push(null);
  }

  for (
    let day = 1;
    day <= last.getDate();
    day += 1
  ) {
    cells.push(
      localISO(
        new Date(
          year,
          month,
          day,
          12,
        ),
      ),
    );
  }

  while (
    cells.length % 7 !== 0
  ) {
    cells.push(null);
  }

  return cells;
}

export function RouteCalendarModal({
  visible,
  selectedDate,
  today,
  days,
  onSelectDate,
  onClose,
}: Props) {
  const [
    visibleMonth,
    setVisibleMonth,
  ] = useState(() =>
    monthStart(
      dateObject(
        selectedDate,
      ),
    ),
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setVisibleMonth(
      monthStart(
        dateObject(
          selectedDate,
        ),
      ),
    );
  }, [
    selectedDate,
    visible,
  ]);

  const summaryByDate =
    useMemo(
      () =>
        new Map(
          days.map(
            (item) => [
              item.date,
              item,
            ],
          ),
        ),
      [days],
    );

  const monthCells =
    useMemo(
      () =>
        buildMonthDays(
          visibleMonth,
        ),
      [visibleMonth],
    );

  const selectedDateObject =
    dateObject(
      selectedDate,
    );

  const selectedMonthMatchesVisible =
    selectedDateObject.getFullYear() ===
      visibleMonth.getFullYear() &&
    selectedDateObject.getMonth() ===
      visibleMonth.getMonth();

  const todayObject =
    dateObject(today);

  const todayMonthMatchesVisible =
    todayObject.getFullYear() ===
      visibleMonth.getFullYear() &&
    todayObject.getMonth() ===
      visibleMonth.getMonth();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={
        onClose
      }
    >
      <View
        style={
          styles.backdrop
        }
      >
        <Pressable
          style={
            styles.dismissArea
          }
          onPress={
            onClose
          }
        />

        <View
          style={
            styles.sheet
          }
        >
          <View
            style={
              styles.handle
            }
          />

          <View
            style={
              styles.header
            }
          >
            <View
              style={
                styles.headerCopy
              }
            >
              <Text
                style={
                  styles.eyebrow
                }
              >
                DRIVER ROUTE
              </Text>

              <Text
                style={
                  styles.title
                }
              >
                Calendar
              </Text>

              <Text
                style={
                  styles.subtitle
                }
              >
                {formatLongDate(
                  selectedDate,
                )}
              </Text>
            </View>

            <Pressable
              onPress={
                onClose
              }
              style={({
                pressed,
              }) => [
                styles.closeButton,
                pressed
                  ? styles.pressed
                  : null,
              ]}
            >
              <Text
                style={
                  styles.closeText
                }
              >
                Close
              </Text>
            </Pressable>
          </View>

          <View
            style={
              styles.content
            }
          >
            <View
              style={
                styles.monthHeader
              }
            >
              <Pressable
                onPress={() =>
                  setVisibleMonth(
                    (current) =>
                      shiftMonth(
                        current,
                        -1,
                      ),
                  )
                }
                style={({
                  pressed,
                }) => [
                  styles.monthArrowButton,
                  pressed
                    ? styles.pressed
                    : null,
                ]}
              >
                <Text
                  style={
                    styles.monthArrowText
                  }
                >
                  ‹
                </Text>
              </Pressable>

              <View
                style={
                  styles.monthTitleWrap
                }
              >
                <Text
                  style={
                    styles.monthTitle
                  }
                >
                  {formatMonthTitle(
                    visibleMonth,
                  )}
                </Text>

                {!selectedMonthMatchesVisible ? (
                  <Text
                    style={
                      styles.monthHint
                    }
                  >
                    Viewing another month
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() =>
                  setVisibleMonth(
                    (current) =>
                      shiftMonth(
                        current,
                        1,
                      ),
                  )
                }
                style={({
                  pressed,
                }) => [
                  styles.monthArrowButton,
                  pressed
                    ? styles.pressed
                    : null,
                ]}
              >
                <Text
                  style={
                    styles.monthArrowText
                  }
                >
                  ›
                </Text>
              </Pressable>
            </View>

            <View
              style={
                styles.quickActions
              }
            >
              <Pressable
                onPress={() => {
                  setVisibleMonth(
                    monthStart(
                      dateObject(
                        selectedDate,
                      ),
                    ),
                  );
                }}
                style={({
                  pressed,
                }) => [
                  styles.quickButton,
                  pressed
                    ? styles.pressed
                    : null,
                ]}
              >
                <Text
                  style={
                    styles.quickButtonText
                  }
                >
                  Selected date
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setVisibleMonth(
                    monthStart(
                      todayObject,
                    ),
                  );
                }}
                style={({
                  pressed,
                }) => [
                  styles.quickButton,
                  todayMonthMatchesVisible
                    ? styles.quickButtonActive
                    : null,
                  pressed
                    ? styles.pressed
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.quickButtonText,
                    todayMonthMatchesVisible
                      ? styles.quickButtonTextActive
                      : null,
                  ]}
                >
                  Today
                </Text>
              </Pressable>
            </View>

            <View
              style={
                styles.weekRow
              }
            >
              {[
                "S",
                "M",
                "T",
                "W",
                "T",
                "F",
                "S",
              ].map(
                (
                  item,
                  index,
                ) => (
                  <Text
                    key={`${item}-${index}`}
                    style={
                      styles.weekDay
                    }
                  >
                    {item}
                  </Text>
                ),
              )}
            </View>

            <View
              style={
                styles.grid
              }
            >
              {monthCells.map(
                (
                  date,
                  index,
                ) => {
                  if (!date) {
                    return (
                      <View
                        key={`empty-${index}`}
                        style={
                          styles.dayCell
                        }
                      />
                    );
                  }

                  const summary =
                    summaryByDate.get(
                      date,
                    );

                  const isSelected =
                    date ===
                    selectedDate;

                  const isToday =
                    date ===
                    today;

                  const dayNumber =
                    Number(
                      date.slice(
                        8,
                        10,
                      ),
                    );

                  return (
                    <Pressable
                      key={date}
                      disabled={
                        !summary &&
                        !isToday
                      }
                      onPress={() => {
                        onSelectDate(
                          date,
                        );

                        onClose();
                      }}
                      style={({
                        pressed,
                      }) => [
                        styles.dayCell,

                        isSelected
                          ? styles.dayCellSelected
                          : null,

                        isToday &&
                        !isSelected
                          ? styles.dayCellToday
                          : null,

                        !summary &&
                        !isToday
                          ? styles.dayCellDisabled
                          : null,

                        pressed
                          ? styles.pressed
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,

                          isSelected
                            ? styles.dayNumberSelected
                            : null,
                        ]}
                      >
                        {
                          dayNumber
                        }
                      </Text>

                      {summary ? (
                        <View
                          style={
                            styles.counts
                          }
                        >
                          {summary.deliveries >
                          0 ? (
                            <Text
                              style={[
                                styles.deliveryCount,

                                isSelected
                                  ? styles.countSelected
                                  : null,
                              ]}
                            >
                              D{" "}
                              {
                                summary.deliveries
                              }
                            </Text>
                          ) : null}

                          {summary.pickups >
                          0 ? (
                            <Text
                              style={[
                                styles.pickupCount,

                                isSelected
                                  ? styles.countSelected
                                  : null,
                              ]}
                            >
                              P{" "}
                              {
                                summary.pickups
                              }
                            </Text>
                          ) : null}
                        </View>
                      ) : isToday ? (
                        <Text
                          style={
                            styles.todayMarker
                          }
                        >
                          TODAY
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                },
              )}
            </View>

            <View
              style={
                styles.legend
              }
            >
              <View
                style={
                  styles.legendItem
                }
              >
                <View
                  style={
                    styles.deliveryDot
                  }
                />

                <Text
                  style={
                    styles.legendText
                  }
                >
                  Delivery
                </Text>
              </View>

              <View
                style={
                  styles.legendItem
                }
              >
                <View
                  style={
                    styles.pickupDot
                  }
                />

                <Text
                  style={
                    styles.legendText
                  }
                >
                  Pickup
                </Text>
              </View>
            </View>

            <Text
              style={
                styles.footerHint
              }
            >
              Only dates with assigned route stops can be selected.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    backdrop: {
      backgroundColor:
        "rgba(20,27,34,0.48)",
      flex: 1,
      justifyContent:
        "flex-end",
    },

    dismissArea: {
      flex: 1,
    },

    sheet: {
      backgroundColor:
        "#f5f1e8",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: "88%",
      overflow: "hidden",
    },

    handle: {
      alignSelf: "center",
      backgroundColor:
        "#c7bfb4",
      borderRadius: 999,
      height: 5,
      marginTop: 9,
      width: 42,
    },

    header: {
      alignItems: "center",
      borderBottomColor:
        "#dfd8ce",
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent:
        "space-between",
      paddingBottom: 15,
      paddingHorizontal: 18,
      paddingTop: 13,
    },

    headerCopy: {
      flex: 1,
    },

    eyebrow: {
      color: "#b88645",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    title: {
      color: "#23313f",
      fontSize: 24,
      fontWeight: "900",
      marginTop: 3,
    },

    subtitle: {
      color: "#81766a",
      fontSize: 11,
      fontWeight: "700",
      marginTop: 3,
    },

    closeButton: {
      alignItems: "center",
      borderColor: "#d1c8bb",
      borderRadius: 12,
      borderWidth: 1,
      justifyContent:
        "center",
      marginLeft: 12,
      minHeight: 40,
      paddingHorizontal: 14,
    },

    closeText: {
      color: "#23313f",
      fontSize: 11,
      fontWeight: "900",
    },

    content: {
      paddingBottom: 30,
      paddingHorizontal: 18,
      paddingTop: 16,
    },

    monthHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent:
        "space-between",
    },

    monthArrowButton: {
      alignItems: "center",
      backgroundColor:
        "#ffffff",
      borderColor: "#ddd6cc",
      borderRadius: 14,
      borderWidth: 1,
      height: 44,
      justifyContent:
        "center",
      width: 44,
    },

    monthArrowText: {
      color: "#23313f",
      fontSize: 29,
      fontWeight: "800",
      lineHeight: 31,
      marginTop: -2,
    },

    monthTitleWrap: {
      alignItems: "center",
      flex: 1,
      paddingHorizontal: 8,
    },

    monthTitle: {
      color: "#23313f",
      fontSize: 19,
      fontWeight: "900",
      textAlign: "center",
    },

    monthHint: {
      color: "#9a8d7e",
      fontSize: 9,
      fontWeight: "700",
      marginTop: 2,
    },

    quickActions: {
      flexDirection: "row",
      gap: 8,
      justifyContent:
        "center",
      marginTop: 12,
    },

    quickButton: {
      alignItems: "center",
      borderColor: "#d1c8bb",
      borderRadius: 999,
      borderWidth: 1,
      justifyContent:
        "center",
      minHeight: 34,
      paddingHorizontal: 14,
    },

    quickButtonActive: {
      backgroundColor:
        "#23313f",
      borderColor:
        "#23313f",
    },

    quickButtonText: {
      color: "#23313f",
      fontSize: 10,
      fontWeight: "900",
    },

    quickButtonTextActive: {
      color: "#ffffff",
    },

    weekRow: {
      flexDirection: "row",
      marginTop: 18,
    },

    weekDay: {
      color: "#9a8d7e",
      flex: 1,
      fontSize: 9,
      fontWeight: "900",
      textAlign: "center",
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 7,
    },

    dayCell: {
      alignItems: "center",
      borderColor:
        "transparent",
      borderRadius: 13,
      borderWidth: 1,
      justifyContent:
        "center",
      minHeight: 62,
      paddingHorizontal: 2,
      paddingVertical: 5,
      width: "14.2857%",
    },

    dayCellSelected: {
      backgroundColor:
        "#23313f",
      borderColor:
        "#23313f",
    },

    dayCellToday: {
      borderColor:
        "#b88645",
    },

    dayCellDisabled: {
      opacity: 0.26,
    },

    dayNumber: {
      color: "#23313f",
      fontSize: 14,
      fontWeight: "900",
    },

    dayNumberSelected: {
      color: "#ffffff",
    },

    counts: {
      alignItems: "center",
      marginTop: 3,
    },

    deliveryCount: {
      color: "#b88645",
      fontSize: 8,
      fontWeight: "900",
    },

    pickupCount: {
      color: "#5f8faa",
      fontSize: 8,
      fontWeight: "900",
      marginTop: 1,
    },

    countSelected: {
      color: "#f0c987",
    },

    todayMarker: {
      color: "#b88645",
      fontSize: 6,
      fontWeight: "900",
      marginTop: 4,
    },

    legend: {
      flexDirection: "row",
      gap: 20,
      justifyContent:
        "center",
      marginTop: 14,
    },

    legendItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },

    deliveryDot: {
      backgroundColor:
        "#b88645",
      borderRadius: 999,
      height: 7,
      width: 7,
    },

    pickupDot: {
      backgroundColor:
        "#5f8faa",
      borderRadius: 999,
      height: 7,
      width: 7,
    },

    legendText: {
      color: "#81766a",
      fontSize: 10,
      fontWeight: "700",
    },

    footerHint: {
      color: "#9a8d7e",
      fontSize: 9,
      fontWeight: "700",
      lineHeight: 14,
      marginTop: 14,
      textAlign: "center",
    },

    pressed: {
      opacity: 0.65,
    },
  });