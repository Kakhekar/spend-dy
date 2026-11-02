package com.spenddiary.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;

public final class SpendWidgetProvider extends AppWidgetProvider {
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SpendWidgetProvider.class));
        for (int id : ids) updateWidget(context, manager, id);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager manager,
            int appWidgetId,
            Bundle newOptions) {
        updateWidget(context, manager, appWidgetId);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int id) {
        Bundle options = manager.getAppWidgetOptions(id);
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        boolean medium = minWidth >= 220;
        RemoteViews views = new RemoteViews(
                context.getPackageName(),
                medium ? R.layout.widget_medium : R.layout.widget_small);
        SharedPreferences values = context.getSharedPreferences(MainActivity.WIDGET_PREFS, Context.MODE_PRIVATE);

        views.setTextViewText(R.id.today_label, values.getString("today_label", "TODAY"));
        views.setTextViewText(R.id.today_amount, values.getString("today_amount", "₹0"));
        views.setTextViewText(R.id.month_label, values.getString("month_label", "THIS MONTH"));
        views.setTextViewText(R.id.month_amount, values.getString("month_amount", "₹0"));

        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        manager.updateAppWidget(id, views);
    }
}
