import { FoodItem, Step3Data } from '@/src/types/PatientRegisterTypes';
import { LANGUAGES } from '@/src/constants/PatientFormConstants';
import { getDurableImageUri } from '@/src/utils/photoUri';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

interface Step3Props {
    data: Step3Data;
    onChange: (data: Partial<Step3Data>) => void;
    showLanguagesPreferred?: boolean;
}

const resolveOpenValue = (
    value: boolean | ((current: boolean) => boolean),
    current: boolean
) => (typeof value === 'function' ? value(current) : value);

export default function Step3Preferences({ data, onChange, showLanguagesPreferred = true }: Step3Props) {
    const [languagesOpen, setLanguagesOpen] = useState(false);
    const [languageItems, setLanguageItems] = useState(LANGUAGES);

    const handlePickFavoritePhoto = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission needed', 'Please allow photo library access.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            base64: true,
            quality: 0.35,
        });

        if (!result.canceled && result.assets?.[0]) {
            const durableUri = getDurableImageUri(result.assets[0]);
            if (durableUri) {
                onChange({ favoritePhotos: [...data.favoritePhotos, durableUri] });
            }
        }
    };

    const handleRemoveFavoritePhoto = (index: number) => {
        onChange({
            favoritePhotos: data.favoritePhotos.filter((_, i) => i !== index),
        });
    };

    const handleAddFood = () => {
        const updated: FoodItem[] = [...data.foodsPreferred, { id: uuidv4(), name: '' }];
        onChange({ foodsPreferred: updated });
    };

    const handleRemoveFood = (id: string) => {
        onChange({
            foodsPreferred: data.foodsPreferred.filter((food) => food.id !== id),
        });
    };

    const handleUpdateFood = (id: string, name: string) => {
        onChange({
            foodsPreferred: data.foodsPreferred.map((food) =>
                food.id === id ? { ...food, name } : food
            ),
        });
    };

    const handleAddFestival = () => {
        onChange({ festivalsCelebrated: [...data.festivalsCelebrated, ''] });
    };

    const handleRemoveFestival = (index: number) => {
        onChange({
            festivalsCelebrated: data.festivalsCelebrated.filter((_, i) => i !== index),
        });
    };

    const handleUpdateFestival = (index: number, name: string) => {
        onChange({
            festivalsCelebrated: data.festivalsCelebrated.map((festival, i) =>
                i === index ? name : festival
            ),
        });
    };

    const handleAddPlace = () => {
        onChange({ favoritePlaces: [...data.favoritePlaces, ''] });
    };

    const handleRemovePlace = (index: number) => {
        onChange({
            favoritePlaces: data.favoritePlaces.filter((_, i) => i !== index),
        });
    };

    const handleUpdatePlace = (index: number, name: string) => {
        onChange({
            favoritePlaces: data.favoritePlaces.map((place, i) =>
                i === index ? name : place
            ),
        });
    };

    const handleAddSport = () => {
        onChange({ preferredSports: [...data.preferredSports, ''] });
    };

    const handleRemoveSport = (index: number) => {
        onChange({
            preferredSports: data.preferredSports.filter((_, i) => i !== index),
        });
    };

    const handleUpdateSport = (index: number, name: string) => {
        onChange({
            preferredSports: data.preferredSports.map((sport, i) =>
                i === index ? name : sport
            ),
        });
    };

    return (
        <View className="gap-4">
            <View>
                <Text className="text-lg font-bold text-gray-800 mb-2">Your Preferences</Text>
                <Text className="text-sm text-gray-600 mb-4">Tell us what you love</Text>
            </View>

            {/* Favorite Pictures */}
            <View>
                <Text className="text-sm font-semibold text-gray-800 mb-2">Favorite Pictures</Text>
                <TouchableOpacity
                    onPress={handlePickFavoritePhoto}
                    className="bg-white rounded-lg p-4 border-2 border-dashed border-blue-300 items-center"
                >
                    <Ionicons name="image" size={32} color="#3b82f6" />
                    <Text className="text-sm text-blue-600 font-semibold mt-2">Upload Pictures</Text>
                </TouchableOpacity>

                {data.favoritePhotos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                        {data.favoritePhotos.map((uri, index) => (
                            <View key={`${uri}-${index}`} className="mr-3 relative">
                                <Image source={{ uri }} className="w-20 h-20 rounded-lg" />
                                <TouchableOpacity
                                    onPress={() => handleRemoveFavoritePhoto(index)}
                                    className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
                                >
                                    <Ionicons name="close" size={12} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* Favorite Places */}
            <View>
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-sm font-semibold text-gray-800">Favorite Places</Text>
                    <TouchableOpacity
                        onPress={handleAddPlace}
                        className="bg-blue-100 rounded-full p-1"
                    >
                        <Ionicons name="add" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                </View>

                {data.favoritePlaces.map((place, index) => (
                    <View key={index} className="flex-row gap-2 mb-2 items-center">
                        <View className="flex-1 flex-row items-center bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-200">
                            <Ionicons name="location-outline" size={20} color="#9ca3af" />
                            <TextInput
                                className="flex-1 ml-2 text-gray-800"
                                placeholder="e.g., Beach, Kandy"
                                placeholderTextColor="#d1d5db"
                                value={place}
                                onChangeText={(text) => handleUpdatePlace(index, text)}
                            />
                        </View>
                        <TouchableOpacity
                            onPress={() => handleRemovePlace(index)}
                            className="bg-red-100 rounded-lg p-2"
                        >
                            <Ionicons name="close" size={20} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                ))}

                {data.favoritePlaces.length === 0 && (
                    <View className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-2">
                        <Text className="text-sm text-blue-700 text-center">
                            Add places you love
                        </Text>
                    </View>
                )}
            </View>

            {/* Festivals Celebrated */}
            <View>
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-sm font-semibold text-gray-800">
                        Festivals Celebrated
                    </Text>
                    <TouchableOpacity
                        onPress={handleAddFestival}
                        className="bg-blue-100 rounded-full p-1"
                    >
                        <Ionicons name="add" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                </View>

                {data.festivalsCelebrated.map((festival, index) => (
                    <View key={index} className="flex-row gap-2 mb-2 items-center">
                        <View className="flex-1 flex-row items-center bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-200">
                            <Ionicons name="sparkles-outline" size={20} color="#9ca3af" />
                            <TextInput
                                className="flex-1 ml-2 text-gray-800"
                                placeholder="e.g., Sinhala New Year"
                                placeholderTextColor="#d1d5db"
                                value={festival}
                                onChangeText={(text) => handleUpdateFestival(index, text)}
                            />
                        </View>
                        <TouchableOpacity
                            onPress={() => handleRemoveFestival(index)}
                            className="bg-red-100 rounded-lg p-2"
                        >
                            <Ionicons name="close" size={20} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                ))}

                {data.festivalsCelebrated.length === 0 && (
                    <View className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-2">
                        <Text className="text-sm text-blue-700 text-center">
                            Add festivals you celebrate
                        </Text>
                    </View>
                )}
            </View>

            {/* Foods Preferred */}
            <View>
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-sm font-semibold text-gray-800">Foods Preferred</Text>
                    <TouchableOpacity
                        onPress={handleAddFood}
                        className="bg-blue-100 rounded-full p-1"
                    >
                        <Ionicons name="add" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                </View>

                {data.foodsPreferred.map((food) => (
                    <View key={food.id} className="flex-row gap-2 mb-2 items-center">
                        <TextInput
                            className="flex-1 bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-200 text-gray-800"
                            placeholder="e.g., Kiribath, Hoppers"
                            placeholderTextColor="#d1d5db"
                            value={food.name}
                            onChangeText={(text) => handleUpdateFood(food.id, text)}
                        />
                        <TouchableOpacity
                            onPress={() => handleRemoveFood(food.id)}
                            className="bg-red-100 rounded-lg p-2"
                        >
                            <Ionicons name="close" size={20} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                ))}

                {data.foodsPreferred.length === 0 && (
                    <View className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-2">
                        <Text className="text-sm text-blue-700 text-center">
                            Add your favorite foods
                        </Text>
                    </View>
                )}
            </View>

            {/* Preferred Sports */}
            <View>
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-sm font-semibold text-gray-800">Preferred Sports</Text>
                    <TouchableOpacity
                        onPress={handleAddSport}
                        className="bg-blue-100 rounded-full p-1"
                    >
                        <Ionicons name="add" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                </View>

                {data.preferredSports.map((sport, index) => (
                    <View key={index} className="flex-row gap-2 mb-2 items-center">
                        <View className="flex-1 flex-row items-center bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-200">
                            <Ionicons name="football-outline" size={20} color="#9ca3af" />
                            <TextInput
                                className="flex-1 ml-2 text-gray-800"
                                placeholder="e.g., Cricket, Walking"
                                placeholderTextColor="#d1d5db"
                                value={sport}
                                onChangeText={(text) => handleUpdateSport(index, text)}
                            />
                        </View>
                        <TouchableOpacity
                            onPress={() => handleRemoveSport(index)}
                            className="bg-red-100 rounded-lg p-2"
                        >
                            <Ionicons name="close" size={20} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                ))}

                {data.preferredSports.length === 0 && (
                    <View className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-2">
                        <Text className="text-sm text-blue-700 text-center">
                            Add sports you enjoy
                        </Text>
                    </View>
                )}
            </View>

            {/* Languages Preferred */}
            {showLanguagesPreferred && (
            <View className="z-[1000]">
                <Text className="text-sm font-semibold text-gray-800 mb-2">
                    Languages Preferred
                </Text>
                <DropDownPicker
                    open={languagesOpen}
                    value={data.languagesPreferred || null}
                    items={languageItems}
                    setOpen={(open) => {
                        setLanguagesOpen(resolveOpenValue(open, languagesOpen));
                    }}
                    setItems={setLanguageItems}
                    setValue={(callback) => {
                        const next = callback(data.languagesPreferred || null);
                        onChange({ languagesPreferred: (next as string) || '' });
                    }}
                    placeholder="Select language"
                    listMode="MODAL"
                />
            </View>
            )}
        </View>
    );
}

