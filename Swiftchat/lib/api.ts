import axios from "axios";

export const api = axios.create({
  baseURL: `${process.env.EXPO_PUBLIC_BACKEND_URL}`, // e.g. http://192.168.1.5:5000/api
});
